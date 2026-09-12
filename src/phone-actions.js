export const PHONE_ACTIONS = [
  { id: "map_search", name: "Find a place in Maps", field: "query", label: "Place or address", limit: 500,
    next: "Android opens your map app with this search. Choose the place and any directions there." },
  { id: "dial_number", name: "Open the phone dialer", field: "number", label: "Phone number", limit: 80,
    next: "Android opens the dialer with this number. You still press Call in the phone app." },
  { id: "share_text", name: "Share chosen text", field: "text", label: "Text to share", limit: 4000,
    next: "Android opens the share chooser. You choose the app and recipient; Argus cannot confirm whether you sent it." }
];

export function phoneActionInfo(capability) { return PHONE_ACTIONS.find(item => item.id === capability); }

export function normalizePhonePayload(capability, payload) {
  const info = phoneActionInfo(capability);
  if (!info) throw new Error("Choose a supported phone action.");
  if (!payload || typeof payload !== "object" || Array.isArray(payload) ||
      Object.keys(payload).length !== 1 || typeof payload[info.field] !== "string") throw new Error(`Enter ${info.label.toLowerCase()}.`);
  const value = payload[info.field].trim();
  if (!value || value.length > info.limit) throw new Error(`${info.label} must contain 1–${info.limit} characters.`);
  const forbidden = capability === "share_text" ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/;
  if (forbidden.test(value)) throw new Error("Remove control characters from this action.");
  if (capability === "dial_number") {
    if (!/^[+0-9 ()-]+$/.test(value)) throw new Error("Use a phone number in digits. Contact names, extensions and service codes are not supported.");
    const number = value.replace(/[ ()-]/g, "");
    if (!/^\+?[0-9]{3,15}$/.test(number)) throw new Error("Use 3–15 digits, with an optional leading + country code.");
    return { number };
  }
  return { [info.field]: value };
}

export function phoneActionDraft(capability, value) {
  const info = phoneActionInfo(capability);
  if (!info) throw new Error("Choose a supported phone action.");
  const payload = normalizePhonePayload(capability, { [info.field]: value });
  const detail = payload[info.field];
  return { title: capability === "share_text" ? "Share chosen text" : `${info.name}: ${detail.slice(0,100)}`,
    capability, payload, status: "draft", requiresConfirmation: true,
    sensitivity: capability === "map_search" ? "low" : "normal" };
}

// Input has only its assistant/politeness prefix removed. The shared body stays literal.
export function parsePhoneCommand(text) {
  const share = text.match(/^share\s+(?:(?:this|the)\s+)?text(?:\s*:\s*|\s+)([\s\S]+)$/i);
  const phrase = text.trim().replace(/[.!?]+$/, "").replace(/,?\s+please$/i, "");
  const dial = phrase.match(/^(?:dial|call|phone|open (?:the )?dialer (?:for|with))\s+(?:the number\s+)?(.+)$/i);
  const map = phrase.match(/^(?:open|show|search)\s+(?:(?:me|the)\s+)?maps?\s+(?:for|of)\s+(.+)$/i) ||
    phrase.match(/^(?:find|show|look up)\s+(?:me\s+)?(.+)\s+(?:on|in)\s+(?:the\s+)?maps?$/i);
  if (!share && !dial && !map) return null;
  try { return { action: phoneActionDraft(share ? "share_text" : dial ? "dial_number" : "map_search", (share || dial || map)[1]) }; }
  catch (error) { return { error: error.message }; }
}

export function reviewPhoneAction(action) {
  const info = phoneActionInfo(action?.capability);
  if (!info) return null;
  try { return { ...info, valid: true, value: normalizePhonePayload(info.id, action.payload)[info.field] }; }
  catch (error) { return { ...info, valid: false, value: "", error: error.message }; }
}
