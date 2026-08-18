/**
 * path-fence: a small pure pair of checks for whether a filesystem path looks
 * safe for an automated process to read, and whether it falls inside a
 * caller-declared set of allowed root directories.
 *
 * This exists to catch honest mistakes, not hostile ones: a typo in a path
 * join, a stray relative segment, an unexpanded home shortcut, a config value
 * that quietly points somewhere it should not. It is accident prevention, not
 * a security boundary. A process that wants to defeat it can simply not call
 * it, or can reach the filesystem through some other path entirely. The real
 * authority against a hostile or compromised process is operating-system
 * level containment: a restricted execution profile, a dedicated user, a
 * mount namespace, a container boundary. Put that in place first and treat
 * this module as a cheap early check that closes off one common category of
 * mistake, not as the wall a determined attacker has to climb.
 *
 * Two invariants keep the checks fail closed:
 *   1. Resolve then match: every input is expanded and normalized to an
 *      absolute canonical form before any pattern or prefix test runs, so a
 *      pattern cannot be dodged by spelling the same path a different way.
 *   2. Fail closed: an input that cannot be resolved to a canonical path is
 *      treated as denied for reads, and as outside for confinement checks.
 *
 * Pure means this module touches no filesystem. It only reshapes strings
 * with node:path and reads the caller's home directory from node:os. It
 * never calls stat, readlink, or realpath, so a not-yet-existing path still
 * normalizes cleanly, and there is one consequence worth stating loudly: a
 * symlink whose target lives somewhere else is never followed or resolved
 * here, so a symlink-based escape will not be caught by this module. That
 * case is exactly what operating-system level containment is for.
 */
import { resolve as resolvePath, normalize, isAbsolute, sep } from "node:path";
import { homedir } from "node:os";

const HOME = homedir();

function expandHome(p: string): string {
  if (p === "~") return HOME;
  if (p.startsWith("~/")) return HOME + p.slice(1);
  return p;
}

/**
 * Turn an arbitrary input into a canonical absolute path string, or null if
 * the input is not a usable path at all. Canonicalization expands a leading
 * home shortcut, makes the result absolute against the caller's home
 * directory when it was given as relative, and collapses `.` and `..`
 * segments. A trailing separator is stripped so that a directory referenced
 * with or without one produces the same string, which matters because the
 * marker checks below key off exact path-segment boundaries.
 *
 * Returns null for anything that is not a non-empty string, or that throws
 * while being resolved. Callers should treat null as "cannot vouch for this
 * path", never as "this path is fine."
 */
export function canonical(p: unknown): string | null {
  if (typeof p !== "string" || p.length === 0) return null;
  try {
    const expanded = expandHome(p);
    const abs = isAbsolute(expanded) ? expanded : resolvePath(HOME, expanded);
    let normalized = normalize(abs);
    if (normalized.length > 1 && normalized.endsWith(sep)) {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return null;
  }
}

/**
 * Filename shapes that read as credential material no matter which directory
 * they sit in: common token and secret prefixes, private-key extensions, and
 * dotfiles that widely-used command-line tools use to hold connection
 * secrets. Matched against the basename only, case insensitively.
 */
export const CREDENTIAL_BASENAME_PATTERNS: readonly RegExp[] = [
  /^token/i,
  /^secret/i,
  /^apikey/i,
  /\.pem$/i,
  /\.key$/i,
  /\.p12$/i,
  /\.env$/i,
  /^\.env\./i,
  /^\.netrc$/i,
  /^\.pgpass$/i,
  /^\.my\.cnf$/i,
  /^\..*webhook/i,
];

/**
 * Directory names that conventionally hold credential material. Each marker
 * carries a separator on both sides and is matched as a path segment
 * anywhere in the canonical path, so both the directory itself and anything
 * nested under it are caught.
 */
export const CREDENTIAL_DIRECTORY_MARKERS: readonly string[] = [
  "/.ssh/",
  "/.aws/",
  "/.gnupg/",
  "/secrets/",
  "/credentials/",
  "/keys/",
];

/**
 * Directories where the operating system keeps service definitions that run
 * automatically and often embed a path to a credential or a command with
 * elevated reach. Paired below with a file-extension check so the
 * directories themselves stay readable and only the definition files inside
 * them are denied.
 */
export const CREDENTIAL_PLIST_DIRECTORY_MARKERS: readonly string[] = [
  "/LaunchAgents/",
  "/LaunchDaemons/",
];

function basenameOf(abs: string): string {
  const parts = abs.split(sep);
  return parts[parts.length - 1] ?? "";
}

function matchesSegmentMarker(abs: string, markers: readonly string[]): boolean {
  const probe = abs.endsWith(sep) ? abs : abs + sep;
  return markers.some((marker) => probe.includes(marker));
}

export interface PathFenceOptions {
  /**
   * Extra substrings to test against the canonical path, on top of the
   * built-in credential patterns. Each one is checked with a plain substring
   * test against the fully resolved path, so a caller can pass a directory
   * marker (with separators on both sides, matching the style of
   * CREDENTIAL_DIRECTORY_MARKERS) or any other fragment specific to their
   * own deployment that this module has no built-in opinion about.
   */
  extraMarkers?: readonly string[];
}

/**
 * True if the given path should not be read by an automated process: it
 * fails to resolve at all, its filename matches a known credential shape,
 * it sits under a known credential directory, it is a service definition
 * file under a known service-definition directory, or it matches one of the
 * caller's own extraMarkers. False means only that none of those checks
 * fired, not that the path is safe in any broader sense.
 */
export function isDeniedRead(p: unknown, opts?: PathFenceOptions): boolean {
  const abs = canonical(p);
  if (abs === null) return true;
  const name = basenameOf(abs);
  if (CREDENTIAL_BASENAME_PATTERNS.some((re) => re.test(name))) return true;
  if (matchesSegmentMarker(abs, CREDENTIAL_DIRECTORY_MARKERS)) return true;
  if (
    CREDENTIAL_PLIST_DIRECTORY_MARKERS.some((marker) => abs.includes(marker)) &&
    abs.toLowerCase().endsWith(".plist")
  ) {
    return true;
  }
  const extra = opts?.extraMarkers ?? [];
  if (extra.some((marker) => abs.includes(marker))) return true;
  return false;
}

/**
 * True only if the given path resolves inside one of allowedRoots and is not
 * denied by isDeniedRead (including any extraMarkers passed through opts).
 * Each root is itself canonicalized before comparison, and a path counts as
 * inside a root only when it equals that root or starts with that root plus
 * a path separator, so a sibling directory that merely shares a root as a
 * string prefix (for example a root of /a/b next to a directory /a/bc) is
 * correctly treated as outside.
 */
export function confineRead(
  p: unknown,
  allowedRoots: readonly string[],
  opts?: PathFenceOptions,
): boolean {
  const abs = canonical(p);
  if (abs === null) return false;
  if (isDeniedRead(abs, opts)) return false;
  const roots = allowedRoots
    .map((r) => canonical(r))
    .filter((r): r is string => r !== null);
  return roots.some((root) => {
    if (abs === root) return true;
    const prefix = root === sep ? root : root + sep;
    return abs.startsWith(prefix);
  });
}
