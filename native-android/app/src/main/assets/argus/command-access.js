const METHODS = new Set([
  "getCommandAccessState", "refreshCommandAccess", "pinCommandShortcut", "addCommandTile",
  "getPendingCommandLaunch", "consumeCommandLaunch"
]);

export function commandAccessAvailable(bridge = globalThis.window?.ArgusAndroid) {
  return [...METHODS].every(method => typeof bridge?.[method] === "function");
}

export function commandAccessBridge(method, payload = {}, bridge = globalThis.window?.ArgusAndroid) {
  if (!METHODS.has(method)) throw new Error("Unknown Command access operation.");
  if (typeof bridge?.[method] !== "function") throw new Error("Command shortcuts need the Argus v0.12 Android app.");
  const result = JSON.parse(bridge[method](JSON.stringify(payload)));
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("Android returned an unreadable access result.");
  if (["blocked", "failed"].includes(result.status)) throw new Error(result.message || "Android could not complete that access request.");
  return result;
}

// The app calls this after startup/resume and when an in-flight operation finishes.
// No text, microphone option or other action from an Intent is ever used here.
export function takeCommandLaunch({ ready, busy, visible }, bridge = globalThis.window?.ArgusAndroid) {
  if (!ready || busy || !visible || !commandAccessAvailable(bridge)) return false;
  const { requestId } = commandAccessBridge("getPendingCommandLaunch", {}, bridge);
  if (typeof requestId !== "string" || !/^command-[a-zA-Z0-9-]{1,80}$/.test(requestId)) return false;
  return commandAccessBridge("consumeCommandLaunch", { requestId }, bridge).consumed === true;
}
