import { test } from "node:test";
import assert from "node:assert/strict";
import { isDeniedRead, confineRead, canonical } from "../src/path-fence.ts";
import { homedir } from "node:os";

const HOME = homedir();

test("the same file spelled three different ways canonicalizes and classifies identically", () => {
  const spellings = [
    "~/project/notes.txt",
    `${HOME}/project/notes.txt`,
    "~/project/other/../notes.txt",
  ];
  const canon = spellings.map((s) => canonical(s));
  assert.ok(canon.every((c) => c === canon[0]), "all three should resolve to the same canonical path");
  const denied = spellings.map((s) => isDeniedRead(s));
  assert.ok(denied.every((d) => d === false), "an ordinary file should not be denied under any spelling");
  const roots = ["~/project"];
  const inside = spellings.map((s) => confineRead(s, roots));
  assert.ok(inside.every((i) => i === true), "all three should confine identically");
});

test("a parent-relative escape out of an allowed root is outside", () => {
  const root = "~/project/sandbox";
  assert.ok(!confineRead("~/project/sandbox/../../elsewhere/file.txt", [root]));
});

test("a root itself is inside", () => {
  const root = "~/project/sandbox";
  assert.ok(confineRead(root, [root]));
  assert.ok(confineRead("~/project/sandbox/", [root]));
});

test("a sibling directory that only shares the root as a string prefix is outside", () => {
  const root = "~/data/ab";
  assert.ok(!confineRead("~/data/abc/file.txt", [root]));
  assert.ok(confineRead("~/data/ab/file.txt", [root]));
});

test("fail-closed: unresolvable input is denied for reads and outside for confinement", () => {
  // proves the module never silently treats a value it cannot canonicalize as safe
  const junk: unknown[] = [null, undefined, 42, {}, [], ""];
  for (const value of junk) {
    assert.equal(canonical(value), null);
    assert.ok(isDeniedRead(value), `isDeniedRead should deny ${String(value)}`);
    assert.ok(!confineRead(value, ["~/project"]), `confineRead should reject ${String(value)}`);
  }
});

test("a traversal segment that resolves onto a credential path is denied", () => {
  assert.ok(isDeniedRead("~/project/sandbox/../../../.aws/credentials"));
});

test("credential family: basename pattern catches a representative", () => {
  assert.ok(isDeniedRead("~/work/token_store.json"));
  assert.ok(isDeniedRead("~/certs/id.pem"));
  assert.ok(!isDeniedRead("~/work/notes.txt"));
});

test("credential family: directory marker catches a representative", () => {
  assert.ok(isDeniedRead("~/x/secrets/db.json"));
  assert.ok(!isDeniedRead("~/x/secretsstash/db.json"), "a directory that merely starts with the marker name is not the marker");
});

test("credential family: directory marker fires with or without a trailing separator", () => {
  assert.ok(isDeniedRead("~/x/secrets"));
  assert.ok(isDeniedRead("~/x/secrets/"));
});

test("credential family: service definition rule catches a representative", () => {
  assert.ok(isDeniedRead("~/Library/LaunchAgents/com.example.agent.plist"));
  assert.ok(isDeniedRead("~/Library/LaunchAgents/com.example.agent.PLIST"), "extension check is case insensitive");
  assert.ok(!isDeniedRead("~/Library/LaunchAgents/notes.txt"), "the directory alone does not deny a non-definition file");
});

test("extraMarkers deny works and defaults to nothing", () => {
  const target = "~/data/private-notes/file.txt";
  assert.ok(!isDeniedRead(target), "no built-in rule covers this path");
  assert.ok(!isDeniedRead(target, {}), "an empty options object adds no markers");
  assert.ok(isDeniedRead(target, { extraMarkers: ["/private-notes/"] }));
  const root = "~/data";
  assert.ok(confineRead(target, [root]));
  assert.ok(!confineRead(target, [root], { extraMarkers: ["/private-notes/"] }));
});

test("without canonicalization: a naive prefix comparison on the raw string would miss this traversal escape, confineRead catches it", () => {
  const root = `${HOME}/project/sandbox`;
  const raw = `${root}/../../../etc/passwd`;
  assert.ok(raw.startsWith(root), "without resolving .. segments the raw string still looks like it starts inside the root");
  assert.ok(!confineRead(raw, [root]), "confineRead resolves first and correctly finds this outside the root");
});

test("canonical treats a trailing separator as insignificant", () => {
  assert.equal(canonical("~/project/notes/"), canonical("~/project/notes"));
});
