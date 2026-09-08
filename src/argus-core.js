export const ARGUS_VERSION = "0.3.0";

export const MODULES = [
  {
    id: "memory-core",
    name: "Memory Core",
    category: "memory",
    status: "ready",
    localFirst: true,
    requiresAndroidBridge: false,
    description: "Capture notes, observations and useful context in local storage."
  },
  {
    id: "investigation-board",
    name: "Investigation Board",
    category: "osint",
    status: "ready",
    localFirst: true,
    requiresAndroidBridge: false,
    description: "Group sources, notes and leads into local OSINT cases."
  },
  {
    id: "voice-notes",
    name: "Voice Notes",
    category: "voice",
    status: "ready",
    localFirst: true,
    requiresAndroidBridge: false,
    description: "Record short audio notes locally through the browser microphone API."
  },
  {
    id: "action-queue",
    name: "Action Queue",
    category: "automation",
    status: "ready",
    localFirst: true,
    requiresAndroidBridge: false,
    description: "Draft and confirm future phone actions before any native automation runs."
  },
  {
    id: "android-share-intake",
    name: "Android Share Intake",
    category: "automation",
    status: "stub",
    localFirst: true,
    requiresAndroidBridge: true,
    description: "Accept shared URLs and text from Android into Argus capture flows."
  },
  {
    id: "local-ai-adapter",
    name: "Local AI Adapter",
    category: "assistant",
    status: "planned",
    localFirst: true,
    requiresAndroidBridge: true,
    description: "Optional local model interface for summarising, search and command planning."
  },
  {
    id: "phone-automation-bridge",
    name: "Phone Automation Bridge",
    category: "automation",
    status: "planned",
    localFirst: true,
    requiresAndroidBridge: true,
    description: "Confirm-before-action bridge for intents, notifications and routines."
  }
];

export const ANDROID_BRIDGE_CAPABILITIES = [
  {
    id: "share_intake",
    name: "Share Intake",
    sensitivity: "low",
    status: "stub",
    description: "Receive text and URLs from Android's share sheet."
  },
  {
    id: "open_url",
    name: "Open URL",
    sensitivity: "low",
    status: "stub",
    description: "Ask Android to open a URL after confirmation."
  },
  {
    id: "notification",
    name: "Notification",
    sensitivity: "normal",
    status: "planned",
    description: "Schedule or show a local notification."
  },
  {
    id: "local_reminder",
    name: "Local Reminder",
    sensitivity: "normal",
    status: "planned",
    description: "Create a local reminder through the native shell."
  },
  {
    id: "apk_update",
    name: "APK Update",
    sensitivity: "high",
    status: "planned",
    description: "Open a signed Argus APK update for Android's installer."
  },
  {
    id: "voice_transcription",
    name: "Voice Transcription",
    sensitivity: "normal",
    status: "planned",
    description: "Transcribe a local audio note using an on-device model."
  }
];

export function createId(prefix = "argus") {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${suffix}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function normalizeTags(input) {
  if (Array.isArray(input)) {
    return input
      .map((tag) => String(tag).trim().toLowerCase())
      .filter(Boolean);
  }

  return String(input || "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

export function detectFirstUrl(text) {
  const match = String(text || "").match(/\bhttps?:\/\/[^\s<>"']+/i);
  return match ? match[0].replace(/[),.;]+$/, "") : "";
}

export function classifyCapture(text) {
  const url = detectFirstUrl(text);
  if (url) {
    return { type: "source", url };
  }

  if (/^(todo|task|remind|check)\b/i.test(String(text || "").trim())) {
    return { type: "task" };
  }

  return { type: "memory" };
}

export function createMemory({ text, tags = [], source = "manual", priority = "normal", createdAt = nowIso() }) {
  const cleanText = String(text || "").trim();
  if (!cleanText) {
    throw new Error("Memory text is required.");
  }

  return {
    id: createId("mem"),
    text: cleanText,
    tags: normalizeTags(tags),
    source,
    priority,
    createdAt,
    updatedAt: createdAt
  };
}

export function createInvestigation({ title, summary = "", status = "active", createdAt = nowIso() }) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) {
    throw new Error("Investigation title is required.");
  }

  return {
    id: createId("case"),
    title: cleanTitle,
    summary: String(summary || "").trim(),
    status,
    sources: [],
    createdAt,
    updatedAt: createdAt
  };
}

export function createSource({ url, title = "", note = "", type = "link", createdAt = nowIso() }) {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl) {
    throw new Error("Source URL is required.");
  }

  return {
    id: createId("src"),
    url: cleanUrl,
    title: String(title || "").trim() || cleanUrl,
    note: String(note || "").trim(),
    type,
    createdAt
  };
}

export function createTool({
  name,
  category = "general",
  status = "manual",
  url = "",
  note = "",
  localFirst = true,
  createdAt = nowIso()
}) {
  const cleanName = String(name || "").trim();
  if (!cleanName) {
    throw new Error("Tool name is required.");
  }

  return {
    id: createId("tool"),
    name: cleanName,
    category: String(category || "general").trim().toLowerCase(),
    status,
    url: String(url || "").trim(),
    note: String(note || "").trim(),
    localFirst: Boolean(localFirst),
    createdAt,
    updatedAt: createdAt
  };
}

export function createVoiceNote({
  title = "",
  mimeType = "audio/webm",
  durationMs = 0,
  transcript = "",
  blob = null,
  createdAt = nowIso()
}) {
  return {
    id: createId("voice"),
    title: String(title || "").trim() || `Voice note ${new Date(createdAt).toLocaleString()}`,
    mimeType,
    durationMs,
    transcript: String(transcript || "").trim(),
    blob,
    createdAt
  };
}

export function createAction({
  title,
  capability = "manual",
  payload = {},
  status = "draft",
  sensitivity = "normal",
  requiresConfirmation = true,
  createdAt = nowIso()
}) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) {
    throw new Error("Action title is required.");
  }

  return {
    id: createId("act"),
    title: cleanTitle,
    capability: String(capability || "manual").trim(),
    payload,
    status,
    sensitivity,
    requiresConfirmation: Boolean(requiresConfirmation),
    createdAt,
    updatedAt: createdAt,
    lastResult: ""
  };
}

export function createEvent({ type, detail = "", createdAt = nowIso() }) {
  return {
    id: createId("event"),
    type,
    detail,
    createdAt
  };
}

export function getSeedTools() {
  return [
    createTool({
      name: "Memory Capture",
      category: "memory",
      status: "ready",
      note: "Save notes and observations into the local memory store."
    }),
    createTool({
      name: "Investigation Board",
      category: "osint",
      status: "ready",
      note: "Create cases and attach source links."
    }),
    createTool({
      name: "Voice Notes",
      category: "voice",
      status: "ready",
      note: "Record short audio notes locally."
    }),
    createTool({
      name: "Share Intake",
      category: "automation",
      status: "stub",
      note: "Designed for Android share-sheet intake once installed or wrapped natively."
    }),
    createTool({
      name: "Local AI Adapter",
      category: "assistant",
      status: "planned",
      note: "Future optional on-device model connector. No paid API requirement."
    })
  ];
}

export function summarizeStats({ memory = [], investigations = [], tools = [], voiceNotes = [], actions = [] }) {
  const sourceCount = investigations.reduce((count, item) => count + (item.sources?.length || 0), 0);
  return {
    memories: memory.length,
    investigations: investigations.length,
    sources: sourceCount,
    tools: tools.length,
    voiceNotes: voiceNotes.length,
    actions: actions.length,
    pendingActions: actions.filter((action) => action.status !== "completed").length,
    readyModules: MODULES.filter((module) => module.status === "ready").length,
    plannedModules: MODULES.filter((module) => module.status !== "ready").length
  };
}

export function normalizeImportPayload(payload) {
  const safe = payload && typeof payload === "object" ? payload : {};
  return {
    memory: Array.isArray(safe.memory) ? safe.memory : [],
    investigations: Array.isArray(safe.investigations) ? safe.investigations : [],
    tools: Array.isArray(safe.tools) ? safe.tools : [],
    voiceNotes: Array.isArray(safe.voiceNotes) ? safe.voiceNotes : [],
    actions: Array.isArray(safe.actions) ? safe.actions : [],
    settings: Array.isArray(safe.settings) ? safe.settings : [],
    events: Array.isArray(safe.events) ? safe.events : []
  };
}
