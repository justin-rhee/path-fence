# path-fence

[![tests](https://github.com/justin-rhee/path-fence/actions/workflows/test.yml/badge.svg)](https://github.com/justin-rhee/path-fence/actions/workflows/test.yml) [![npm](https://img.shields.io/npm/v/path-fence.svg)](https://www.npmjs.com/package/path-fence) [![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE) ![node >= 22](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg) ![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)

A small function your scripts call before reading a file, so a path that leads to your passwords or keys gets refused instead of opened.

```ts
import { isDeniedRead, confineRead } from "path-fence";

isDeniedRead("~/.ssh/id_ed25519");                                        // true
isDeniedRead("~/projects/app/notes/../../../.ssh/id_ed25519");            // true: resolved before it's checked
isDeniedRead("~/.config/gh/hosts.yml");                                   // true: the file from the story below
isDeniedRead("~/notes/private/a.txt", { extraMarkers: ["/private/"] });   // true: your own additions
confineRead("~/projects/app/../app-secrets/keys.txt", ["~/projects/app"]); // false: outside the root
```

The command that got past my first guard was `cat ~/.config/gh/hosts.yml`, a plain read of a file I'd never put on a list, holding my GitHub token. A read that finds a credential looks exactly like one that finds nothing, until you look at what came back.

## Use it if

- your agent or scripts build file paths from variables, and one unexpanded piece can land somewhere you never meant
- you want the deny list visible and extendable rather than forked
- you need the check to stay pure and never touch the filesystem

## Install

```sh
npm install path-fence
```

Node 22 or newer. No dependencies, only `node:path`. It ships compiled JavaScript with type definitions. Rather vendor it? Copy `src/path-fence.ts` into your project instead: about 210 lines, and Node 22 reads TypeScript directly.

## How it works

1. every path is canonicalized first: `~` expanded, made absolute, `.` and `..` collapsed, so a rule can't be dodged by spelling
2. `isDeniedRead` refuses known credential shapes (key files, token and secret names, connection dotfiles), known credential folders, auto-run service definitions, an unresolvable path, and anything in your `extraMarkers`
3. `confineRead` also requires the path to sit inside one of your allowed roots, on a real path boundary, so a sibling folder that only shares a name prefix doesn't count

The built-in patterns are exported as named constants, so you can see exactly what's covered before adding to it.

## What it won't do

- match your own `extraMarkers` case-sensitively, since those are plain substring tests
- follow a symlink, since it never touches the filesystem, so a link to a file elsewhere isn't caught here
- replace operating system enforcement, which is the real authority for symlink escapes
- stop code that skips it, since nothing forces a caller to use it, and a hostile process simply won't
- scan file contents, so a credential saved under an unusual name in an unlisted folder passes through
- run on Windows yet

## How I tested it

- 18 tests: `bash tests/run.sh`
- the same file spelled three ways classifies identically, and a `..` escape lands outside an allowed root
- one test shows a plain string comparison missing a `..` escape, then the real check catching it once the path is resolved; design decisions are in [docs/ADR.md](docs/ADR.md)

## License

MIT. See [LICENSE](LICENSE). No warranty. Security notes and how to report a problem: [SECURITY.md](SECURITY.md).

<!-- related:start -->
## Related

- [transcript-redactor](https://github.com/justin-rhee/transcript-redactor): keeps credentials out of agent transcripts
- [untrusted-read](https://github.com/justin-rhee/untrusted-read): stops instructions hidden in shared notes from steering an agent

Part of a small set of tools I pulled out of my own agent harness. I use them myself and read every issue. More on my [GitHub profile](https://github.com/justin-rhee).
<!-- related:end -->
