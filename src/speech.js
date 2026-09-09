export const SPEECH_BUSY_PHASES = ["starting", "listening", "processing"];

export function emptySpeechCapture() {
  return { sessionId: "", phase: "idle", partial: "", transcript: "", message: "" };
}

export function beginSpeechCapture(sessionId) {
  if (!/^speech-[a-z0-9-]{1,80}$/i.test(sessionId)) throw new Error("Invalid speech session.");
  return { ...emptySpeechCapture(), sessionId, phase: "starting", message: "Starting the microphone…" };
}

export function isSpeechBusy(capture) {
  return SPEECH_BUSY_PHASES.includes(capture.phase);
}

// Recognition produces review text only. This module never parses or dispatches commands.
export function reduceSpeechCapture(capture, event) {
  if (!event || event.sessionId !== capture.sessionId || !isSpeechBusy(capture)) return capture;
  const text = String(event.text || "").trim().slice(0, 4000);
  if (event.type === "listening" && capture.phase === "starting") {
    return { ...capture, phase: "listening", message: "Listening. Speak your command." };
  }
  if (event.type === "partial" && capture.phase !== "processing") return { ...capture, partial: text };
  if (event.type === "processing") return { ...capture, phase: "processing", message: "Finishing recognition…" };
  if (event.type === "result") {
    return { ...capture, phase: text ? "review" : "error", transcript: text, partial: "",
      message: text ? "Review this text, then use it in the command box." : "No speech was recognised. Try again or type your command." };
  }
  if (event.type === "cancelled" || event.type === "error") {
    return { ...capture, phase: event.type, partial: "", transcript: "", message: String(event.message || "Speech capture stopped.").slice(0, 500) };
  }
  return capture;
}

export function speechBridge(method, payload = {}) {
  const allowed = ["getSpeechState", "startSpeech", "stopSpeech", "cancelSpeech", "requestSpeechPermission", "openSpeechSettings", "checkSpeechLanguage", "downloadSpeechLanguage"];
  if (!allowed.includes(method)) throw new Error("Unknown speech operation.");
  if (typeof window.ArgusAndroid?.[method] !== "function") throw new Error("Offline speech input needs the Argus v0.8 Android app. You can type your command here.");
  const result = JSON.parse(window.ArgusAndroid[method](JSON.stringify(payload)));
  if (result.status === "blocked" || result.status === "failed") throw new Error(result.message || "Android could not start speech input.");
  return result;
}
