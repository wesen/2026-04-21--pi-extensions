import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

// Use the same TypeScript loader dependency as the installed Pi.
const require = createRequire(path.join(process.env.PI_PACKAGE_ROOT, "package.json"));
const { createJiti } = require("jiti");
const jiti = createJiti(import.meta.url, { moduleCache: false });
const { MetadataCadence } = await jiti.import("./cadence.ts");
const { readInterval, writeInterval } = await jiti.import("./config.ts");
const { default: extension } = await jiti.import("./index.ts");
const { getPiExtension } = await jiti.import("../_shared/registry.ts");
const { runSnapshotSelfTests } = await jiti.import("./snapshot.ts");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "session-context-test-"));
const oldHome = process.env.HOME;
process.env.HOME = temporary;
try {
  const cadence = new MetadataCadence();
  assert.deepEqual(Array.from({length: 11}, () => cadence.next("same", 5).emit),
    [true, false, false, false, false, true, false, false, false, false, true]);
  assert.equal(cadence.next("changed", 5).identityChanged, true);
  cadence.reset();
  assert.equal(cadence.next("changed", 5).emit, true);
  assert.equal(cadence.next("changed", 1).emit, true);

  const configFile = path.join(temporary, "config.json");
  assert.equal(readInterval(configFile), 5);
  fs.writeFileSync(configFile, '{"other":true}');
  writeInterval(7, configFile);
  assert.equal(readInterval(configFile), 7);
  assert.equal(JSON.parse(fs.readFileSync(configFile)).other, true);
  assert.throws(() => writeInterval(0, configFile));
  fs.writeFileSync(configFile, '{broken');
  assert.equal(readInterval(configFile), 5);
  assert.throws(() => writeInterval(5, configFile));

  const hooks = new Map();
  const pi = { on: (event, handler) => hooks.set(event, handler),
    events: {on() {}}, registerCommand() {} };
  const entries = [];
  const ctx = {
    hasUI: false, cwd: temporary, model: {provider: "test", id: "a"},
    ui: {notify() {}},
    sessionManager: {
      getHeader: () => ({timestamp: "2026-09-05T00:00:00Z"}),
      getBranch: () => entries, buildContextEntries: () => entries,
      getSessionId: () => "test-session", getSessionName: () => "Test",
      getLeafId: () => "leaf", getSessionFile: () => undefined,
    },
  };
  extension(pi);
  await hooks.get("session_start")({}, ctx);
  const input = (text = "hello", source = "interactive") => hooks.get("input")({text, source}, ctx);
  const system = () => hooks.get("before_agent_start")({systemPrompt: "base"}, ctx);
  assert.equal((await input("hello", "extension")).action, "continue");
  assert.equal((await input("/skill:foo")).action, "continue");
  assert.match((await input()).text, /Session id: test-session/);
  const first = (await system()).systemPrompt;
  for (let i = 0; i < 4; i++) {
    entries.push({type: "message", message: {role: "user", content: "hello"}});
    assert.equal((await input()).action, "continue");
    assert.equal((await system()).systemPrompt, first);
    await hooks.get("turn_start")({turnIndex: i}, ctx);
    await hooks.get("turn_end")({}, ctx);
  }
  const periodic = (await input()).text;
  assert.match(periodic, /Prompt number/);
  assert.doesNotMatch(periodic, /Session id:|Active model:/);
  assert.notEqual((await system()).systemPrompt, first);
  ctx.model.id = "b";
  await hooks.get("model_select")({}, ctx);
  assert.match((await input()).text, /Active model: test\/b/);
  assert.match((await system()).systemPrompt, /"id": "b"/);
  await hooks.get("session_compact")({}, ctx);
  assert.match((await input()).text, /Session id:/);
  await hooks.get("session_tree")({}, ctx);
  assert.match((await input()).text, /Session id:/);
  const registration = getPiExtension("session-context");
  assert.match(registration.docs[0].load(ctx), /Repeat every N prompts/);
  const settings = registration.settings;
  await settings.onApply({repeatEveryPrompts: 3}, ctx);
  assert.equal(readInterval(), 3);
  assert.match((await input()).text, /Session id:/);
  assert.equal((await input()).action, "continue");
  assert.equal((await input()).action, "continue");
  assert.equal((await input()).action, "transform");
  assert.ok(runSnapshotSelfTests().every(result => result.ok));
  console.log("PASS: cadence, config persistence, event wiring, stable system block, identity refresh, compaction/tree reset, and existing snapshot tests");
} finally {
  if (oldHome === undefined) delete process.env.HOME;
  else process.env.HOME = oldHome;
  fs.rmSync(temporary, {recursive: true, force: true});
}
