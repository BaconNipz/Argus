import test from "node:test";
import assert from "node:assert/strict";
import { beginWakeMode, canStartWakeCapture, emptyWakeMode, isWakeBusy, reduceWakeMode, wakeBridge, wakeBridgeAvailable } from "../src/wake-phrase.js";

const event = (phase, extra = {}) => ({ type: "wake_state", sessionId: "wake-one", phase, ...extra });
const ready = { ready: true, visible: true, view: "command", busy: false, speechAvailable: true };
const detected = () => reduceWakeMode(beginWakeMode("wake-one"), event("detected"));

test("wake capture requires visible Command, completed startup and free speech input", () => {
  assert.equal(canStartWakeCapture(detected(), ready), true);
  for (const change of [{ ready: false }, { visible: false }, { view: "routines" }, { busy: true }, { speechAvailable: false }]) {
    assert.equal(canStartWakeCapture(detected(), { ...ready, ...change }), false);
  }
  for (const phase of ["idle", "starting", "listening", "stopping", "handoff", "consumed", "cancelled", "expired", "error"]) {
    assert.equal(canStartWakeCapture({ ...detected(), phase }, ready), false);
  }
});

test("Stop takes precedence over queued detection and listening callbacks", () => {
  const stopping = { ...beginWakeMode("wake-one"), phase: "stopping" };
  for (const phase of ["starting", "listening", "detected"]) assert.equal(reduceWakeMode(stopping, event(phase)), stopping);
  const cancelled = reduceWakeMode(stopping, event("cancelled"));
  assert.equal(isWakeBusy(cancelled), false);
  assert.equal(reduceWakeMode(cancelled, event("detected")), cancelled);
});

test("a claimed detection cannot hand off twice or revive after completion", () => {
  const handoff = { ...detected(), phase: "handoff" };
  assert.equal(reduceWakeMode(handoff, event("detected")), handoff);
  const consumed = reduceWakeMode(handoff, event("consumed"));
  assert.equal(consumed.phase, "consumed");
  for (const phase of ["starting", "listening", "detected", "cancelled"]) assert.equal(reduceWakeMode(consumed, event(phase)), consumed);
  assert.equal(canStartWakeCapture(consumed, ready), false);
});

test("old sessions cannot overwrite a newly armed test", () => {
  const current = beginWakeMode("wake-two");
  for (const phase of ["listening", "detected", "cancelled", "error"]) assert.equal(reduceWakeMode(current, event(phase)), current);
  assert.equal(reduceWakeMode(current, { type: "wake_rejected", sessionId: "wake-one" }), current);
});

test("invalid events and session identifiers cannot arm or trigger capture", () => {
  const idle = emptyWakeMode();
  for (const input of [null, [], "detected", {}, event("unknown"), event("detected", { sessionId: ["wake-one"] }), event("detected", { sessionId: "wake-" })]) {
    assert.equal(reduceWakeMode(idle, input), idle);
  }
  for (const id of [null, 12, ["wake-one"], "wake-", "wake-one\n", "other-one", "wake-" + "x".repeat(81)]) assert.throws(() => beginWakeMode(id));
});

test("native rejection ends startup and preserves a bounded explanation", () => {
  const start = beginWakeMode("wake-one");
  const rejected = reduceWakeMode(start, { type: "wake_rejected", sessionId: "wake-one", message: "Microphone unavailable" });
  assert.equal(rejected.phase, "error");
  assert.equal(rejected.message, "Microphone unavailable");
  assert.equal(isWakeBusy(rejected), false);
  const result = reduceWakeMode(start, event("expired", { audioMs: Infinity, elapsedMs: -5, message: "a".repeat(600) }));
  assert.equal(result.audioMs, 0);
  assert.equal(result.elapsedMs, 0);
  assert.equal(result.message.length, 500);
});

test("wake bridge passes only the requested operation and never dispatches commands", () => {
  const calls = [];
  const bridge = Object.fromEntries(["getWakeState", "startWakeListening", "stopWakeListening", "startSpeechFromWake"].map(method => [method, raw => {
    calls.push({ method, payload: JSON.parse(raw) }); return '{"status":"requested"}';
  }]));
  assert.equal(wakeBridgeAvailable(bridge), true);
  const payload = { wakeId: "wake-one", sessionId: "speech-one", language: "en-AU" };
  wakeBridge("startSpeechFromWake", payload, bridge);
  assert.deepEqual(calls, [{ method: "startSpeechFromWake", payload }]);
  assert.throws(() => wakeBridge("dispatchAction", {}, bridge), /Unknown/);
  assert.throws(() => wakeBridge("runCommand", {}, bridge), /Unknown/);
});

test("older shells and unreadable or blocked responses have explicit errors", () => {
  assert.equal(wakeBridgeAvailable({ startSpeech() {} }), false);
  assert.throws(() => wakeBridge("getWakeState", {}, {}), /v0.13/);
  for (const raw of ["null", "[]", '"okay"', "invalid", '{"status":"blocked"}']) {
    assert.throws(() => wakeBridge("getWakeState", {}, { getWakeState: () => raw }));
  }
  assert.throws(() => wakeBridge("startWakeListening", {}, { startWakeListening: () => '{"status":"failed","message":"Return to Argus"}' }), /Return to Argus/);
});
