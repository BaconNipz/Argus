import test from "node:test";
import assert from "node:assert/strict";
import {
  MODULES,
  buildOsintSearchLinks,
  classifyCapture,
  createAction,
  createEvidence,
  createInvestigation,
  createMemory,
  createSource,
  createTool,
  detectOsintTargetType,
  detectFirstUrl,
  normalizeImportPayload,
  normalizeTags,
  reviewMemoryRecords,
  searchLocalRecords,
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
  const evidence = createEvidence({ investigationId: investigation.id, fileName: "lead.png" });
  const tool = createTool({ name: "Local parser" });
  const action = createAction({ title: "Open saved source", capability: "open_url" });

  assert.match(memory.id, /^mem-/);
  assert.match(investigation.id, /^case-/);
  assert.match(source.id, /^src-/);
  assert.match(evidence.id, /^ev-/);
  assert.match(tool.id, /^tool-/);
  assert.match(action.id, /^act-/);
  assert.equal(action.requiresConfirmation, true);
});

test("detects common OSINT target types", () => {
  assert.equal(detectOsintTargetType("person@example.com"), "email");
  assert.equal(detectOsintTargetType("example.com"), "domain");
  assert.equal(detectOsintTargetType("https://example.com/profile"), "url");
  assert.equal(detectOsintTargetType("@example_user"), "username");
});

test("creates OSINT search links for target templates", () => {
  const domainLinks = buildOsintSearchLinks("example.com", "domain");
  assert.ok(domainLinks.some((source) => source.url.includes("crt.sh")));
  assert.ok(domainLinks.every((source) => source.reliability === "unverified"));

  const caseRecord = createInvestigation({
    title: "Manual domain case",
    target: "example.com",
    templateId: "domain"
  });
  assert.equal(caseRecord.targetType, "domain");
  assert.ok(caseRecord.checklist.some((item) => item.toLowerCase().includes("certificate")));
});

test("searches across local records", () => {
  const investigation = createInvestigation({
    title: "Domain case",
    target: "example.com",
    templateId: "domain"
  });
  investigation.sources = [
    createSource({
      url: "https://example.com/profile",
      title: "Profile hit",
      tags: ["osint"]
    })
  ];
  const evidence = createEvidence({
    investigationId: investigation.id,
    title: "Passport screenshot",
    note: "Visible document number"
  });

  const results = searchLocalRecords(
    {
      memory: [createMemory({ text: "Remember the example.com domain", tags: ["domain"] })],
      investigations: [investigation],
      evidence: [evidence]
    },
    "passport"
  );

  assert.equal(results[0].kind, "evidence");
  assert.equal(results[0].title, "Passport screenshot");
});

test("reviews memory for stale, duplicate and sensitive items", () => {
  const oldPrivate = createMemory({
    text: "Shared login note",
    sensitivity: "private",
    createdAt: "2026-01-01T00:00:00.000Z"
  });
  const duplicateA = createMemory({ text: "Duplicate fact", createdAt: "2026-09-07T00:00:00.000Z" });
  const duplicateB = createMemory({ text: "duplicate fact", createdAt: "2026-09-08T00:00:00.000Z" });
  const review = reviewMemoryRecords(
    [oldPrivate, duplicateA, duplicateB],
    new Date("2026-09-08T00:00:00.000Z")
  );

  assert.deepEqual(review.stale.map((item) => item.id), [oldPrivate.id]);
  assert.equal(review.duplicates.length, 2);
  assert.deepEqual(review.sensitive.map((item) => item.id), [oldPrivate.id]);
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
    actions: [{ id: "a1", status: "draft" }],
    evidence: [{ id: "e1" }, { id: "e2" }]
  });

  assert.equal(stats.memories, 1);
  assert.equal(stats.sources, 2);
  assert.equal(stats.evidence, 2);
  assert.equal(stats.voiceNotes, 1);
  assert.equal(stats.pendingActions, 1);
});

test("normalizes import payloads defensively", () => {
  const payload = normalizeImportPayload({ memory: [{ id: "m1" }], tools: "bad" });
  assert.deepEqual(payload.memory, [{ id: "m1" }]);
  assert.deepEqual(payload.tools, []);
  assert.deepEqual(payload.evidence, []);
});
