import test from "node:test";
import assert from "node:assert/strict";
import { backgroundVoiceAvailable, backgroundVoiceBridge, canTakeBackgroundWake, microphoneLevel, spokenCommandMode } from "../src/background-voice.js";
import { parseArgusCommand } from "../src/argus-core.js";

const info = { enabled: true, pendingToken: "background-one" };
const ready = { ready: true, visible: true, busy: false, editing: false, seen: "" };

test("background capture needs an enabled, fresh native token and a ready visible app", () => {
  assert.equal(canTakeBackgroundWake(info, ready), true);
  for (const change of [{ ready: false }, { visible: false }, { busy: true }, { editing: true }, { seen: "background-one" }]) assert.equal(canTakeBackgroundWake(info, { ...ready, ...change }), false);
  assert.equal(canTakeBackgroundWake({ ...info, enabled: false }, ready), false);
  for (const token of ["", null, ["background-one"], "background-", "background-one\n", "background-" + "x".repeat(81), "speech-one"]) assert.equal(canTakeBackgroundWake({ ...info, pendingToken: token }, ready), false);
});

test("supported spoken local commands can be routed without another Run tap", () => {
  for (const phrase of ["remember to bring my keys", "search copper", "start case test", "open memory", "give me a summary", "help"]) {
    const parsed = parseArgusCommand(phrase);
    assert.equal(spokenCommandMode(parsed), "local", phrase + ": " + parsed.intent);
  }
});

test("spoken reminders and external actions remain drafts rather than native dispatch", () => {
  for (const phrase of ["remind me in ten minutes to stretch", "open https://example.com"]) assert.equal(spokenCommandMode(parseArgusCommand(phrase)), "draft", phrase);
  assert.equal(spokenCommandMode({ intent: "future", action: { kind: "call" } }), "draft");
});

test("unclear, negative and future commands require review", () => {
  for (const phrase of ["do not remember this", "delete all my files", "something unclear"]) assert.equal(spokenCommandMode(parseArgusCommand(phrase)), "review", phrase);
  assert.equal(spokenCommandMode({ intent: "future" }), "review");
  assert.equal(spokenCommandMode(null), "review");
});

test("background bridge cannot approve or dispatch an action", () => {
  let payload;
  const bridge = Object.fromEntries(["getBackgroundWakeState", "configureBackgroundWake", "requestAssistantRole", "openBackgroundVoiceSettings", "startBackgroundSpeech", "finishBackgroundCommand"].map(method => [method, raw => { payload = JSON.parse(raw); return '{"status":"requested"}'; }]));
  assert.equal(backgroundVoiceAvailable(bridge), true);
  backgroundVoiceBridge("startBackgroundSpeech", { token: "background-one", sessionId: "speech-one" }, bridge);
  assert.deepEqual(payload, { token: "background-one", sessionId: "speech-one" });
  assert.throws(() => backgroundVoiceBridge("dispatchAction", {}, bridge), /Unknown/);
  assert.throws(() => backgroundVoiceBridge("approveAction", {}, bridge), /Unknown/);
});

test("unavailable native background operations fail clearly", () => {
  assert.equal(backgroundVoiceAvailable({}), false);
  assert.throws(() => backgroundVoiceBridge("configureBackgroundWake", {}, {}), /v0.14/);
  for (const response of ["null", "[]", "bad JSON", '{"status":"blocked","message":"Allow microphone"}']) assert.throws(() => backgroundVoiceBridge("getBackgroundWakeState", {}, { getBackgroundWakeState: () => response }));
});

test("volume feedback distinguishes quiet samples and clipping without claiming recognition", () => {
  assert.match(microphoneLevel({}), /Waiting/);
  assert.match(microphoneLevel({ micDb: -75 }), /Very quiet/);
  assert.match(microphoneLevel({ micDb: -40 }), /Quiet/);
  assert.match(microphoneLevel({ micDb: -20 }), /Audio reaching/);
  assert.match(microphoneLevel({ micDb: -10, micPeak: 0.99 }), /Clipping/);
  assert.match(microphoneLevel({ micDb: -20 }), /not recognition accuracy/);
});
