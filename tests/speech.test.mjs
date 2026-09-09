import test from "node:test";
import assert from "node:assert/strict";
import { beginSpeechCapture, emptySpeechCapture, isSpeechBusy, reduceSpeechCapture, speechBridge } from "../src/speech.js";

test("speech ends as review text without an action to execute", () => {
  let capture = beginSpeechCapture("speech-test-1");
  capture = reduceSpeechCapture(capture, { type: "listening", sessionId: "speech-test-1" });
  capture = reduceSpeechCapture(capture, { type: "partial", sessionId: "speech-test-1", text: "open" });
  assert.equal(capture.transcript, "");
  capture = reduceSpeechCapture(capture, { type: "result", sessionId: "speech-test-1", text: "open https://example.com" });
  assert.equal(capture.phase, "review");
  assert.equal(capture.transcript, "open https://example.com");
  assert.equal(isSpeechBusy(capture), false);
  assert.equal(capture.command, undefined);
  assert.equal(capture.action, undefined);
});

test("cancelled and superseded sessions cannot supply late command text", () => {
  const first = beginSpeechCapture("speech-old");
  const cancelled = reduceSpeechCapture(first, { type: "cancelled", sessionId: "speech-old" });
  assert.equal(reduceSpeechCapture(cancelled, { type: "result", sessionId: "speech-old", text: "unwanted" }), cancelled);
  const next = beginSpeechCapture("speech-new");
  assert.equal(reduceSpeechCapture(next, { type: "result", sessionId: "speech-old", text: "stale" }), next);
});

test("processing cannot regress to listening or accept late partial speech", () => {
  const processing = reduceSpeechCapture(beginSpeechCapture("speech-one"), { type: "processing", sessionId: "speech-one" });
  assert.equal(reduceSpeechCapture(processing, { type: "listening", sessionId: "speech-one" }), processing);
  assert.equal(reduceSpeechCapture(processing, { type: "partial", sessionId: "speech-one", text: "late partial" }), processing);
  assert.equal(reduceSpeechCapture(processing, { type: "result", sessionId: "speech-one", text: "final" }).transcript, "final");
});

test("blank results and errors release busy state without a usable transcript", () => {
  for (const event of [{ type: "result", text: " " }, { type: "error", message: "Microphone denied" }]) {
    const result = reduceSpeechCapture(beginSpeechCapture("speech-one"), { ...event, sessionId: "speech-one" });
    assert.equal(result.phase, "error");
    assert.equal(result.transcript, "");
    assert.equal(isSpeechBusy(result), false);
  }
});

test("completed results are not replaced by duplicate callbacks and text is bounded", () => {
  const capture = reduceSpeechCapture(beginSpeechCapture("speech-one"), { type: "result", sessionId: "speech-one", text: "x".repeat(5000) });
  assert.equal(capture.transcript.length, 4000);
  assert.equal(reduceSpeechCapture(capture, { type: "error", sessionId: "speech-one" }), capture);
  assert.equal(isSpeechBusy(emptySpeechCapture()), false);
});

test("missing native speech support does not call a browser or generic recognizer", () => {
  let browserCalls = 0;
  globalThis.window = { SpeechRecognition: () => browserCalls++, webkitSpeechRecognition: () => browserCalls++ };
  try {
    assert.throws(() => speechBridge("startSpeech", {}), /v0.8 Android app/);
    assert.equal(browserCalls, 0);
    window.ArgusAndroid = { startSpeech: () => '{"status":"blocked","message":"Microphone permission denied"}' };
    assert.throws(() => speechBridge("startSpeech", {}), /permission denied/);
    assert.throws(() => speechBridge("dispatchAction", {}), /Unknown speech operation/);
  } finally { delete globalThis.window; }
});
