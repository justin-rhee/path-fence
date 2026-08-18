# Architecture Decision Records (ADRs)

Why this is shaped the way it is, including three defects the tests found in the version I was already running.

## It resolves before it compares, and that ordering is the whole design

The obvious way to check a path is to compare the string you were handed. It is also wrong, because one file has many spellings. `~/x`, `/Users/me/x`, and `/Users/me/./sub/../x` are the same file and only one of them looks like it.

So every input goes through a canonicalizer first: leading `~` expanded, relative input made absolute, `.` and `..` collapsed. Every rule after that reads the canonical form and nothing else. A test makes the point directly by doing it the wrong way round: a plain prefix comparison on the raw path lets a `..` escape out of an allowed root, and the same check catches it once the path is resolved first.

## Unresolvable input is denied, not skipped

A non-string, an empty string, a null: none of these can be canonicalized, and the tempting behavior is to shrug and pass them through on the grounds that they are not really paths.

That is exactly backwards for a deny list. The whole value of this module is that a caller can ask "is this safe to read" and trust a no. If the answer for garbage input is a cheerful yes, the one case where a caller most needs the check is the case it abandons. Unresolvable input is denied for reads and outside for confinement, always.

## The trailing slash that walked straight through

`node:path`'s normalize preserves a trailing separator, and the directory markers were tested as substrings padded with separators on both sides. So a credential directory written with a trailing slash matched, and the same directory written bare did not, unless some basename rule happened to catch it by accident.

I found this by writing a test for the marker list rather than by reading it, which is the pattern for all three defects here. The fix strips the trailing separator during canonicalization and adds a virtual one at comparison time, so both spellings deny. A test pins both.

The same defect exists in the private original this came from. That is tracked where the original lives, and the honest note here is that publishing this version does not fix the one still running on my own machine.

## Two more the tests found

The plist suffix check was case-sensitive while every other check in the module was case-insensitive, so a differently-cased service definition file slipped past a rule that was meant to catch it. Now lowercased like everything else.

One basename pattern was a strict subset of another and could never match anything the broader pattern had not already caught. Removed, with no behavior change, because a rule that cannot fire is a rule nobody can reason about.

## The deny list is exported, and yours goes on top

The private version carried a hardcoded list of path markers specific to one machine. That list is gone, and callers add their own through `opts.extraMarkers` instead.

Making the built-in patterns exported constants matters more than it sounds. A deny list you cannot read is a promise you cannot check, and the alternative is that everyone who needs one more marker forks the module and their fork drifts. One vendor's config-directory marker was removed before publication for reasons specific to my setup; anyone who needs that coverage adds it in one line rather than editing the module.

## It never touches the filesystem, so it cannot follow a symlink

There is no `stat`, no `readlink`, no `realpath` anywhere in it, which keeps the module pure, fast, and safe to call anywhere, including in a hot path or a hook.

The cost is real and stated plainly in the README: a symlink pointing at a credential file from an innocent-looking location is not followed and not caught. Resolving symlinks would mean touching the disk on every call, racing with anything that can move a link between the check and the read, and turning a pure function into one that can fail for reasons unrelated to its answer. Symlink escapes belong to the operating system layer, which is where this module tells you to put the real boundary.

## What this is not

Not a security boundary. It stops honest code from reaching a file it never meant to open. A hostile process ignores it by not calling it, and nothing here can change that, so the README says so in its first paragraph rather than in a footnote.
