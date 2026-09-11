const METHODS = new Set(["getBackgroundWakeState", "configureBackgroundWake", "requestAssistantRole", "openBackgroundVoiceSettings", "startBackgroundSpeech", "finishBackgroundCommand"]);
const TOKEN = /^background-[a-zA-Z0-9-]{1,80}$/;

export function backgroundVoiceAvailable(bridge = globalThis.window?.ArgusAndroid) {
  return [...METHODS].every(name => typeof bridge?.[name] === "function");
}
export function backgroundVoiceBridge(method, payload = {}, bridge = globalThis.window?.ArgusAndroid) {
  if (!METHODS.has(method)) throw new Error("Unknown background voice operation.");
  if (typeof bridge?.[method] !== "function") throw new Error("Background voice needs the Argus v0.14 Android app.");
  const result = JSON.parse(bridge[method](JSON.stringify(payload)));
  if (!result || typeof result !== "object" || Array.isArray(result) || ["blocked", "failed"].includes(result.status)) throw new Error(result?.message || "Android could not complete this request.");
  return result;
}

export function canTakeBackgroundWake(info, { ready, visible, busy, editing, seen }) {
  return info?.enabled === true && typeof info.pendingToken === "string" && info.pendingToken.trim() === info.pendingToken &&
    TOKEN.test(info.pendingToken) && info.pendingToken !== seen && ready === true && visible === true && !busy && !editing;
}

// A recognised command can create local records or drafts. No dispatch/approval is done here.
export function spokenCommandMode(parsed) {
  if (!parsed || parsed.intent === "unknown") return "review";
  if (parsed.intent === "local_reminder" || parsed.action) return "draft";
  return ["help", "stop_speaking", "navigate", "status", "search", "memory", "investigation", "source", "speak_reply"].includes(parsed.intent) ? "local" : "review";
}

export function microphoneLevel(info) {
  if (!Number.isFinite(info?.micDb)) return "Waiting for microphone samples…";
  const db = Math.max(-100, Math.min(0, info.micDb));
  const label = info.micPeak >= 0.98 ? "Clipping — try moving a little farther away" : db < -50 ? "Very quiet" : db < -35 ? "Quiet" : "Audio reaching Argus";
  return `${label} (${Math.round(db)} dBFS). This measures volume, not recognition accuracy.`;
}
