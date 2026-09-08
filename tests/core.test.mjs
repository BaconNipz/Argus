import test from "node:test";
import assert from "node:assert/strict";
import {
  MODULES,
  classifyCapture,
  createAction,
  createInvestigation,
  createMemory,
  createSource,
  createTool,
  detectFirstUrl,
  normalizeImportPayload,
  normalizeTags,
  summarizeStats
} from "../src/argus-core.js";

test("normalizes comma-separated tags", () => {
  assert.deepEqual(normalizeTags("OSINT, Phone,  urgent "), ["osint", "phone", "urgent"]);
});

test("detects and trims source URLs", () => {
  assert.equal(detectFirstUrl("Look at https://example.com/test."), "https://example.com/test");
  assert.equal(classifyCapture("source https://example.com/profile").type, "source");
});

test("creates required local-first records", () => {
  const memory = createMemory({ text: "Remember this", tags: ["Argus"] });
  const investigation = createInvestigation({ title: "Case A" });
  const source = createSource({ url: "https://example.com" });
  const tool = createTool({ name: "Local parser" });
  const action = createAction({ title: "Open saved source", capability: "open_url" });

  assert.match(memory.id, /^mem-/);
  assert.match(investigation.id, /^case-/);
  assert.match(source.id, /^src-/);
  assert.match(tool.id, /^tool-/);
  assert.match(action.id, /^act-/);
  assert.equal(action.requiresConfirmation, true);
});

test("module map keeps ready and future Android modules explicit", () => {
  assert.ok(MODULES.some((module) => module.status === "ready" && module.localFirst));
  assert.ok(MODULES.some((module) => module.requiresAndroidBridge && module.status !== "ready"));
});

test("summarizes local dashboard stats", () => {
  const stats = summarizeStats({
    memory: [{ id: "m1" }],
    investigations: [{ id: "i1", sources: [{ id: "s1" }, { id: "s2" }] }],
    tools: [{ id: "t1" }],
    voiceNotes: [{ id: "v1" }],
    actions: [{ id: "a1", status: "draft" }]
  });

  assert.equal(stats.memories, 1);
  assert.equal(stats.sources, 2);
  assert.equal(stats.voiceNotes, 1);
  assert.equal(stats.pendingActions, 1);
});

test("normalizes import payloads defensively", () => {
  const payload = normalizeImportPayload({ memory: [{ id: "m1" }], tools: "bad" });
  assert.deepEqual(payload.memory, [{ id: "m1" }]);
  assert.deepEqual(payload.tools, []);
});
