export function readNativeBridgeInfo() {
  const fallback = {
    available: false,
    host: "web",
    version: "web-core",
    capabilities: [],
    message: "Native Android bridge is not attached."
  };

  if (!window.ArgusAndroid?.getBridgeInfo) {
    return fallback;
  }

  try {
    return {
      ...fallback,
      ...JSON.parse(window.ArgusAndroid.getBridgeInfo()),
      available: true,
      host: "android"
    };
  } catch (error) {
    return {
      ...fallback,
      message: error?.message || "Native bridge responded with unreadable data."
    };
  }
}

export function registerNativeInbox(onShare) {
  window.ArgusNativeInbox = {
    receiveShare(value) {
      onShare(String(value || ""));
      return true;
    }
  };
}

export async function dispatchNativeAction(action) {
  if (action?.status !== "approved") {
    return { dispatched: false, status: "blocked", message: "Approve the action before dispatch." };
  }
  if (!window.ArgusAndroid?.dispatchAction) {
    return {
      dispatched: false,
      status: "waiting_for_bridge",
      message: "Action is queued locally. Native Android bridge is not attached yet."
    };
  }

  try {
    const result = window.ArgusAndroid.dispatchAction(JSON.stringify(action));
    let parsed = {};
    try {
      parsed = JSON.parse(result);
    } catch {
      parsed = { message: result };
    }
    const status = parsed.status || "completed";
    return {
      dispatched: status === "completed",
      status,
      message: parsed.message || result || "Native bridge accepted the action."
    };
  } catch (error) {
    return {
      dispatched: false,
      status: "blocked",
      message: error?.message || "Native bridge rejected the action."
    };
  }
}

export function reminderBridge(method, payload = {}) {
  const bridge = window.ArgusAndroid;
  if (typeof bridge?.[method] !== "function") {
    throw new Error("Install the Argus v0.7 Android APK to schedule notifications. This reminder can still be saved here.");
  }
  const result = JSON.parse(bridge[method](JSON.stringify(payload)));
  if (result.status === "blocked" || result.status === "failed") throw new Error(result.message);
  return result;
}
