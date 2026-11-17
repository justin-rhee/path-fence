# Security policy. path-fence

## Posture

path-fence is provided as-is, with NO WARRANTY (see LICENSE). Use it as one
control among several, never as a sole guarantee.

If this is a security-oriented tool, the honest ceiling applies: it **reduces,
does not eliminate**, the risk it addresses. Behavioral rules are defense-in-depth
on top of a structural limit, and the structural limit only holds if the host
environment actually enforces it (e.g. actually withholds the tools/permissions
the design assumes are withheld). State that assumption; do not let it read as a
promise the code can't keep.

## Validation status

The offline test suite has been run: 18 tests pass, 0 fail (`bash tests/run.sh`,
Node 22). The tests check path canonicalization, the deny list (credential
file names, credential folders, CLI token files, service definitions), case
variants of those folders, and confinement to allowed roots. They do not cover
symlinks, Windows paths, a path that spells a credential in a way the deny
list has no pattern for, or any real filesystem behavior. There is no
separate red-team corpus.

## Reporting a vulnerability

Report privately to https://github.com/justin-rhee. Please do not open a public issue for a
suspected vulnerability. give a reasonable window for a fix first.
