import test from "node:test";
import assert from "node:assert/strict";
import { createAction, parseArgusCommand, summarizeStats } from "../src/argus-core.js";
import { normalizePhonePayload, phoneActionDraft, reviewPhoneAction } from "../src/phone-actions.js";
import { spokenCommandMode } from "../src/background-voice.js";
import { dispatchNativeAction } from "../src/android-bridge.js";
import { BACKUP_STORES } from "../src/backup.js";
import { prepareArgusImport } from "../src/db.js";

test("Maps aliases and polite prefixes create reviewed searches with the chosen place", () => {
  for (const phrase of ["Show Adelaide Oval on maps", "Hey Argus, could you show me Adelaide Oval in maps?", "Please open maps for Adelaide Oval", "Search the map for Adelaide Oval", "Look up Adelaide Oval on the map please"]) {
    const parsed = parseArgusCommand(phrase);
    assert.equal(parsed.intent, "map_search", phrase);
    assert.deepEqual(parsed.payload, { query: "Adelaide Oval" });
    assert.equal(parsed.action.status, "draft");
    assert.equal(parsed.action.requiresConfirmation, true);
    assert.equal(spokenCommandMode(parsed), "draft");
  }
  assert.equal(parseArgusCommand("Find my notes about Adelaide Oval").intent, "search");
});

test("dialer aliases accept explicit digits and never become automatic calls", () => {
  for (const phrase of ["Dial +61 (8) 1234-5678", "Call the number +61 8 1234 5678", "Could you open the dialer for +61812345678?", "Phone +61812345678 please"]) {
    const parsed = parseArgusCommand(phrase);
    assert.equal(parsed.intent, "dial_number", phrase);
    assert.deepEqual(parsed.payload, { number: "+61812345678" });
    assert.equal(parsed.action.status, "draft");
    assert.equal(parsed.safety, "queued for confirmation");
    assert.equal(spokenCommandMode(parsed), "draft");
  }
  for (const value of ["Mum", "123 ext 2", "*123#", "123;456", "123,456", "tel:123", "12+34", "++123", "12", "1".repeat(16), "１２３", "one two three", "123\n456"]) {
    assert.throws(() => normalizePhonePayload("dial_number", { number: value }), undefined, value);
    assert.equal(parseArgusCommand(`Dial ${value}`).action, null, value);
  }
});

test("sharing preserves chosen text, Unicode, line breaks and punctuation after the prefix", () => {
  const body = "I’m at Café 🌿.\nMeet at 5:30?\nThank you, please!";
  for (const prefix of ["Share text: ", "Share this text: ", "Hey Argus, would you please share the text: ", "I’d like you to share text "]) {
    const parsed = parseArgusCommand(prefix + body);
    assert.equal(parsed.intent, "share_text", prefix);
    assert.deepEqual(parsed.payload, { text: body });
    assert.equal(parsed.action.requiresConfirmation, true);
    assert.equal(spokenCommandMode(parsed), "draft");
  }
  assert.equal(parseArgusCommand("Send a message to Casey").action, null);
  assert.equal(parseArgusCommand("Share my last note").action, null);
});

test("negative, conditional and chained phone requests do not queue any action", () => {
  for (const phrase of ["Don't call 12345", "Please do not show Adelaide on maps", "If I say yes dial 12345", "Share text: hello and then call 12345", "Open maps for Adelaide and share text: hello", "Dial 12345 then open https://example.com", "When I get home phone 12345"]) {
    const parsed = parseArgusCommand(phrase);
    assert.equal(parsed.intent, "unknown", phrase);
    assert.equal(parsed.action, null, phrase);
    assert.equal(spokenCommandMode(parsed), "review", phrase);
  }
});

test("review validates the whole payload and preserves URI-like map or share text as literal data", () => {
  for (const [kind, field, limit] of [["map_search", "query", 500], ["share_text", "text", 4000]]) {
    const literal = 'intent://example/#Intent;action=CALL;end & q=other <img src=x>';
    assert.equal(reviewPhoneAction(phoneActionDraft(kind, literal)).value, literal);
    assert.equal(reviewPhoneAction(phoneActionDraft(kind, "x".repeat(limit))).valid, true);
    for (const payload of [null, [], { [field]: 123 }, { [field]: "" }, { [field]: "x", url: "https://example.com" }, { wrong: "x" }, { [field]: "x".repeat(limit + 1) }, { [field]: "bad\u0000text" }]) {
      assert.equal(reviewPhoneAction({ capability: kind, payload }).valid, false);
    }
  }
  assert.throws(() => phoneActionDraft("map_search", "first\nsecond"));
  assert.throws(() => phoneActionDraft("call_number", "12345"));
  assert.equal(reviewPhoneAction({ capability: "open_url" }), null);
});

test("the pending count excludes handed-off and dismissed actions", () => {
  const actions = ["draft", "approved", "blocked", "handed_off", "cancelled", "completed"].map(status => ({ status }));
  assert.equal(summarizeStats({ actions }).pendingActions, 3);
});

test("native handoff needs approval and valid details before the bridge can be called", async () => {
  let calls = 0;
  let dispatched;
  globalThis.window = { ArgusAndroid: { dispatchAction(raw) { calls++; dispatched = JSON.parse(raw); return '{"status":"handed_off","message":"Opened chooser"}'; } } };
  try {
    for (const [kind, value] of [["map_search", "Adelaide Oval"], ["dial_number", "12345"], ["share_text", "Hello"]]) {
      const action = createAction(phoneActionDraft(kind, value));
      assert.equal((await dispatchNativeAction(action)).dispatched, false);
      assert.equal((await dispatchNativeAction({ ...action, status: "approved", payload: { ...action.payload, url: "https://example.com" } })).dispatched, false);
    }
    assert.equal(calls, 0);
    const result = await dispatchNativeAction({ ...createAction(phoneActionDraft("share_text", "Hello")), status: "approved" });
    assert.equal(calls, 1);
    assert.equal(result.dispatched, true);
    assert.equal(result.status, "handed_off");
    assert.notEqual(result.status, "completed");
    await dispatchNativeAction({ ...createAction(phoneActionDraft("dial_number", "12345")), status: "approved", payload: { number: " +61 (8) 1234-5678 " } });
    assert.deepEqual(dispatched.payload, { number: "+61812345678" });
  } finally { delete globalThis.window; }
});

test("missing bridge, unavailable apps and malformed native results are not successful handoffs", async () => {
  globalThis.window = {};
  const action = { ...createAction(phoneActionDraft("map_search", "Adelaide Oval")), status: "approved" };
  try {
    assert.equal((await dispatchNativeAction(action)).status, "waiting_for_bridge");
    for (const reply of ['{"status":"blocked","message":"No map app"}', '{"status":"failed"}', '{}', '[]', 'null', 'true', 'not JSON', '{"status":"sent"}']) {
      window.ArgusAndroid = { dispatchAction: () => reply };
      const result = await dispatchNativeAction(action);
      assert.equal(result.dispatched, false, reply);
      assert.ok(["blocked", "failed"].includes(result.status), reply);
    }
  } finally { delete globalThis.window; }
});

test("backup restores phone details but clears pending approvals and retains handoff history", async () => {
  const payload = { format: "argus-backup", schema: 4, appVersion: "0.15.0", exportedAt: "2026-09-12T00:00:00Z", ...Object.fromEntries(BACKUP_STORES.map(store => [store, []])) };
  payload.actions = [
    { ...createAction(phoneActionDraft("dial_number", "12345")), status: "approved" },
    { ...createAction(phoneActionDraft("share_text", "Hello\n🌿")), status: "handed_off" }
  ];
  const restored = await prepareArgusImport(JSON.parse(JSON.stringify(payload)));
  assert.equal(restored.actions[0].status, "draft");
  assert.equal(restored.actions[0].requiresConfirmation, true);
  assert.deepEqual(restored.actions[0].payload, { number: "12345" });
  assert.equal(restored.actions[1].status, "handed_off");
  assert.equal(restored.actions[1].payload.text, "Hello\n🌿");
});
