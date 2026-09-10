export function emptySpeechOutput() {
  return { sessionId: "", phase: "idle", message: "" };
}

export function isOutputBusy(output) {
  return ["starting", "speaking"].includes(output.phase);
}

export function beginSpeechOutput(sessionId) {
  if (!/^tts-[a-z0-9-]{1,80}$/i.test(sessionId)) throw new Error("Invalid speech-output session.");
  return { sessionId, phase: "starting", message: "Preparing the spoken reply…" };
}

export function reduceSpeechOutput(output, event) {
  if (!event || event.sessionId !== output.sessionId || !isOutputBusy(output)) return output;
  if (!["speaking", "done", "stopped", "error"].includes(event.type)) return output;
  return { ...output, phase: event.type, message: String(event.message || "").slice(0, 500) };
}

export function ttsBridge(method, payload = {}) {
  const allowed = ["getTtsState", "refreshTtsVoices", "selectTtsVoice", "speakOffline", "stopTts", "openTtsSettings"];
  if (!allowed.includes(method)) throw new Error("Unknown speech-output operation.");
  if (typeof window.ArgusAndroid?.[method] !== "function") throw new Error("Offline spoken replies need the Argus v0.9 Android app.");
  const result = JSON.parse(window.ArgusAndroid[method](JSON.stringify(payload)));
  if (result.status === "blocked" || result.status === "failed") throw new Error(result.message || "Android could not start spoken output.");
  return result;
}
