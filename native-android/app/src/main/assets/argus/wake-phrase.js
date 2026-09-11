const BUSY = new Set(["starting", "listening", "stopping", "detected", "handoff"]);
const PHASES = new Set([...BUSY, "idle", "consumed", "cancelled", "expired", "error"]);
const METHODS = new Set(["getWakeState", "startWakeListening", "stopWakeListening", "startSpeechFromWake"]);
const validId = value => typeof value === "string" && value.trim() === value && /^wake-[a-zA-Z0-9-]{1,80}$/.test(value);

export function emptyWakeMode() { return { sessionId: "", phase: "idle", message: "", audioMs: 0, elapsedMs: 0 }; }
export function isWakeBusy(mode) { return BUSY.has(mode.phase); }
export function beginWakeMode(sessionId) {
  if (!validId(sessionId)) throw new Error("Invalid wake session.");
  return { ...emptyWakeMode(), sessionId, phase: "starting", message: "Loading the offline wake model…" };
}

export function reduceWakeMode(mode, event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) return mode;
  if (mode.sessionId && event.sessionId !== mode.sessionId) return mode;
  if (event.type === "wake_rejected" && mode.phase === "starting") {
    return { ...mode, phase: "error", message: String(event.message || "Wake listening could not start.").slice(0, 500) };
  }
  if (event.type !== "wake_state" || !PHASES.has(event.phase)) return mode;
  if (event.sessionId !== "" && !validId(event.sessionId)) return mode;
  if (mode.phase === "stopping" && !["cancelled", "expired", "error"].includes(event.phase)) return mode;
  if (mode.phase === "handoff" && !["consumed", "cancelled", "expired", "error"].includes(event.phase)) return mode;
  if (mode.sessionId && !isWakeBusy(mode)) return mode;
  return { sessionId: event.sessionId, phase: event.phase, message: String(event.message || "").slice(0, 500),
    audioMs: boundedTime(event.audioMs), elapsedMs: boundedTime(event.elapsedMs) };
}

function boundedTime(value) { return Number.isFinite(value) ? Math.max(0, value) : 0; }

export function canStartWakeCapture(mode, { ready, visible, view, busy, speechAvailable }) {
  return mode.phase === "detected" && validId(mode.sessionId) &&
    ready === true && visible === true && view === "command" && !busy && speechAvailable === true;
}

export function wakeBridgeAvailable(bridge = globalThis.window?.ArgusAndroid) {
  return [...METHODS].every(method => typeof bridge?.[method] === "function");
}

export function wakeBridge(method, payload = {}, bridge = globalThis.window?.ArgusAndroid) {
  if (!METHODS.has(method)) throw new Error("Unknown wake operation.");
  if (typeof bridge?.[method] !== "function") throw new Error("Wake listening needs the Argus v0.13 Android app.");
  const result = JSON.parse(bridge[method](JSON.stringify(payload)));
  if (!result || typeof result !== "object" || Array.isArray(result) || ["blocked", "failed"].includes(result.status)) {
    throw new Error(result?.message || "Android could not complete the wake request.");
  }
  return result;
}
