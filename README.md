# path-fence

The command that got past my first guard was `cat ~/.config/gh/hosts.yml`. Nothing clever about it, just a plain read of a file I'd never thought to put on a list, holding my GitHub token.

Credential files sit in a small number of predictable places, and a read that finds one looks exactly like a read that finds nothing until you look at what came back. If your agent builds paths out of variables, one wrong or unexpanded piece drops you somewhere you never meant to be, and nothing about the call says so.

So this is the path half of that problem on its own: one pure function that resolves a path properly before anything gets compared, then denies the shapes that read as credential material. About 190 lines of TypeScript over `node:path`. It's accident prevention for honest code and not a security boundary, because a hostile process skips it by not calling it, and what actually stops one is an operating system sandbox.

## Use it if

- your agent or scripts assemble file paths from variables
- an unexpanded piece can land you in a home directory you did not mean
- you want the deny list visible and extendable rather than forked
- you need the check to stay pure and never touch the filesystem

## How it works

Every input is run through a canonicalizer first: it expands a leading `~`, makes the path absolute against the caller's home directory when needed, and collapses `.` and `..` segments. That canonical form is the only thing every other check looks at, so a path can't slip past a rule by being spelled a different way.

`isDeniedRead(path, opts?)` returns true when the canonical path can't be resolved, when its filename matches a known credential shape (token and secret prefixes, private key extensions, dotfiles used by common tools for connection secrets), when it sits inside a known credential directory, when it's a service definition file under a directory the operating system uses to run things automatically, or when it matches one of the caller's own `extraMarkers`. It denies by default and never treats an unresolved path as safe.

`confineRead(path, allowedRoots, opts?)` adds one more requirement on top of `isDeniedRead`: the canonical path has to actually sit inside one of the caller's allowed root directories, either equal to a root or nested under it. A directory that merely shares characters with a root as a string prefix doesn't count as nested; only a real path boundary does.

`extraMarkers` in `opts` lets a caller add their own substrings to the deny list without forking the module. The built-in credential patterns are exported as named constants, so anyone using this can see exactly what is covered before adding their own rules on top

## Install

There's no package registry entry yet. Copy `src/path-fence.ts` into your project, or clone this repository and import from it directly. It has zero dependencies and runs as-is under a TypeScript runtime that supports `.ts` imports natively, such as a recent Node.

## What it won't do

- touch the filesystem, since there's no `stat`, `readlink` or `realpath` call in it,
  so a symlink whose target lives elsewhere isn't followed and won't be caught here
- replace operating system enforcement, which is the authority for symlink escapes
- stop code that bypasses it, since nothing forces a caller to run a path through it first
- scan file contents, since its credential patterns are substring and basename
  heuristics, so a credential saved under an unconventional name in an unlisted
  directory passes straight through

## How I tested it

The suite covers the same file spelled three different ways resolving and classifying identically, a `..` escape out of an allowed root landing outside, unresolvable input (a non-string, an empty string, null) being denied for reads and outside for confinement, one representative case for each built-in credential family, `extraMarkers` denying when supplied and staying inert by default, a root counting as inside itself, and a sibling directory that only shares a root as a string prefix counting as outside. One test shows plain string prefix comparison on the raw, unresolved path would have missed a `..` escape, then shows the real check catching it once the path is resolved first.

Running `bash tests/run.sh`, the last lines of the run are:

```
ℹ pass 13
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 114.46275
```

## License

MIT. See [LICENSE](LICENSE). No warranty. Security notes and how to report a problem: [SECURITY.md](SECURITY.md).

Design decisions and what changed while building it: [docs/ADR.md](docs/ADR.md).

---

This little tool is one of a handful I pulled out of my own day-to-day agent setup. I use them all myself, so when something breaks I usually notice fast. But if you run into any issues, or anything that looks off, open an issue. I read every one. More tools on my [GitHub profile](https://github.com/justin-rhee).
