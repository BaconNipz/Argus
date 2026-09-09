import test from "node:test";
import assert from "node:assert/strict";
import { beginSpeechOutput, emptySpeechOutput, isOutputBusy, reduceSpeechOutput, ttsBridge } from "../src/speech-output.js";

test("spoken reply stays busy until Android finishes playback", () => {
  let output = beginSpeechOutput("tts-one");
  assert.equal(isOutputBusy(output), true);
  output = reduceSpeechOutput(output, { type: "speaking", sessionId: "tts-one" });
  assert.equal(isOutputBusy(output), true);
  output = reduceSpeechOutput(output, { type: "done", sessionId: "tts-one" });
  assert.equal(isOutputBusy(output), false);
  assert.equal(isOutputBusy(emptySpeechOutput()), false);
});

test("stopped or superseded replies ignore late playback callbacks", () => {
  const stopped = reduceSpeechOutput(beginSpeechOutput("tts-old"), { type: "stopped", sessionId: "tts-old" });
  assert.equal(reduceSpeechOutput(stopped, { type: "speaking", sessionId: "tts-old" }), stopped);
  const next = beginSpeechOutput("tts-new");
  assert.equal(reduceSpeechOutput(next, { type: "error", sessionId: "tts-old" }), next);
  const failed = reduceSpeechOutput(next, { type: "error", sessionId: "tts-new", message: "Offline voice unavailable" });
  assert.equal(isOutputBusy(failed), false);
  assert.equal(failed.message, "Offline voice unavailable");
});

test("microphone events cannot alter spoken-output status", () => {
  const output = beginSpeechOutput("tts-one");
  assert.equal(reduceSpeechOutput(output, { type: "result", sessionId: "tts-one", text: "open URL" }), output);
  assert.equal(reduceSpeechOutput(output, { type: "listening", sessionId: "speech-one" }), output);
});

test("missing offline output never falls back to browser synthesis", () => {
  let browserCalls = 0;
  globalThis.window = { speechSynthesis: { speak: () => browserCalls++ } };
  try {
    assert.throws(() => ttsBridge("speakOffline", { text: "hello" }), /v0.9 Android app/);
    assert.equal(browserCalls, 0);
    window.ArgusAndroid = { speakOffline: () => '{"status":"blocked","message":"Voice unavailable"}' };
    assert.throws(() => ttsBridge("speakOffline"), /Voice unavailable/);
    assert.throws(() => ttsBridge("dispatchAction"), /Unknown speech-output operation/);
  } finally { delete globalThis.window; }
});
