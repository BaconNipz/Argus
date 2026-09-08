export const ARGUS_VERSION = "0.4.1";

export const MEMORY_TYPES = ["note", "person", "project", "source", "place", "account", "task"];
export const MEMORY_SENSITIVITY = ["normal", "sensitive", "private"];
export const SOURCE_TYPES = ["link", "profile", "post", "document", "image", "domain", "email", "username", "other"];
export const SOURCE_RELIABILITY = ["unknown", "unverified", "corroborated", "primary", "archived"];
export const OSINT_TARGET_TYPES = ["auto", "username", "email", "domain", "url", "image", "general"];

export const INVESTIGATION_TEMPLATES = [
  {
    id: "blank",
    name: "Blank Case",
    targetType: "general",
    summary: "",
    checklist: [
      "Write the question this case is trying to answer.",
      "Record every source with a reliability label.",
      "Attach screenshots, files or notes as evidence.",
      "Separate confirmed facts from working guesses."
    ]
  },
  {
    id: "username",
    name: "Username Sweep",
    targetType: "username",
    summary: "Find where a username appears, then record only source-backed links and notes.",
    checklist: [
      "Search the exact username in more than one engine.",
      "Check whether matching profiles share avatar, wording, links or timing.",
      "Save profile URLs as sources before drawing links between them.",
      "Mark weak matches as unverified."
    ]
  },
  {
    id: "email",
    name: "Email Trace",
    targetType: "email",
    summary: "Trace public mentions of an email address and its domain without sending mail.",
    checklist: [
      "Search the exact email address.",
      "Search the domain and local-part separately.",
      "Avoid login, reset-password or contact actions.",
      "Record where the address appears and why it matters."
    ]
  },
  {
    id: "domain",
    name: "Domain Check",
    targetType: "domain",
    summary: "Collect public domain context, certificate traces and indexed pages.",
    checklist: [
      "Check indexed pages for the domain.",
      "Review certificate transparency records.",
      "Record related domains, nameservers or organisations as notes.",
      "Capture suspicious findings with evidence files."
    ]
  },
  {
    id: "image",
    name: "Image Metadata",
    targetType: "image",
    summary: "Store the image locally, note visible details and queue manual reverse-image checks.",
    checklist: [
      "Attach the original image or screenshot as evidence.",
      "Note visible text, logos, landmarks and timestamps.",
      "Use reverse-image tools manually if you choose to upload a copy.",
      "Keep the original file separate from edited screenshots."
    ]
  }
];

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
    id: "local-search",
    name: "Local Search",
    category: "memory",
    status: "ready",
    localFirst: true,
    requiresAndroidBridge: false,
    description: "Search memory, cases, sources, evidence and voice notes on-device."
  },
  {
    id: "evidence-locker",
    name: "Evidence Locker",
    category: "osint",
    status: "ready",
    localFirst: true,
    requiresAndroidBridge: false,
    description: "Attach local files, screenshots and notes to investigation cases."
  },
  {
    id: "osint-lead-builder",
    name: "OSINT Lead Builder",
    category: "osint",
    status: "ready",
    localFirst: true,
    requiresAndroidBridge: false,
    description: "Create username, email, domain and image-metadata case templates."
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
    id: "android-file-picker",
    name: "Android File Picker",
    category: "files",
    status: "ready",
    localFirst: true,
    requiresAndroidBridge: true,
    description: "Use Android's system picker to attach local files into Argus evidence records."
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
    id: "file_picker",
    name: "File Picker",
    sensitivity: "normal",
    status: "ready",
    description: "Attach a local file to an investigation through Android's document picker."
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

export function normalizeChoice(value, allowed, fallback) {
  const clean = String(value || "").trim().toLowerCase();
  return allowed.includes(clean) ? clean : fallback;
}

export function normalizeMemoryType(value) {
  return normalizeChoice(value, MEMORY_TYPES, "note");
}

export function normalizeMemorySensitivity(value) {
  return normalizeChoice(value, MEMORY_SENSITIVITY, "normal");
}

export function normalizeSourceType(value) {
  return normalizeChoice(value, SOURCE_TYPES, "link");
}

export function normalizeSourceReliability(value) {
  return normalizeChoice(value, SOURCE_RELIABILITY, "unknown");
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

export function detectOsintTargetType(value) {
  const text = String(value || "").trim();
  if (!text) return "general";
  if (detectFirstUrl(text)) return "url";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return "email";
  if (/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i.test(text)) return "domain";
  if (/^@?[a-z0-9][a-z0-9._-]{1,63}$/i.test(text)) return "username";
  return "general";
}

export function normalizeOsintTargetType(value, target = "") {
  const clean = normalizeChoice(value, OSINT_TARGET_TYPES, "auto");
  return clean === "auto" ? detectOsintTargetType(target) : clean;
}

function makeSearchSource({ title, url, note = "", type = "link" }) {
  return {
    title,
    url,
    note,
    type,
    reliability: "unverified",
    tags: ["search-link", type]
  };
}

export function buildOsintSearchLinks(target, targetType = "auto") {
  const cleanTarget = String(target || "").trim();
  if (!cleanTarget) return [];

  const detectedType = normalizeOsintTargetType(targetType, cleanTarget);
  const quoted = `"${cleanTarget}"`;
  const encodedQuoted = encodeURIComponent(quoted);
  const encodedTarget = encodeURIComponent(cleanTarget);
  const googleSearch = (query) => `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const duckSearch = (query) => `https://duckduckgo.com/?q=${encodeURIComponent(query)}`;
  const links = [
    makeSearchSource({
      title: `Google exact search for ${cleanTarget}`,
      url: googleSearch(quoted),
      note: "Exact public web search. Review manually before trusting matches.",
      type: detectedType
    }),
    makeSearchSource({
      title: `DuckDuckGo exact search for ${cleanTarget}`,
      url: duckSearch(quoted),
      note: "Second search engine for comparison.",
      type: detectedType
    })
  ];

  if (detectedType === "username") {
    links.push(
      makeSearchSource({
        title: `GitHub user search for ${cleanTarget}`,
        url: `https://github.com/search?q=${encodedTarget}&type=users`,
        note: "Manual username check on GitHub.",
        type: "username"
      })
    );
  }

  if (detectedType === "email") {
    const [, localPart = "", domain = ""] = cleanTarget.match(/^([^@\s]+)@([^@\s]+)$/) || [];
    if (domain) {
      links.push(
        makeSearchSource({
          title: `Search ${domain} for ${localPart}`,
          url: googleSearch(`site:${domain} "${localPart}"`),
          note: "Checks whether the email local-part appears on its own domain.",
          type: "email"
        })
      );
    }
  }

  if (detectedType === "domain") {
    links.push(
      makeSearchSource({
        title: `Indexed pages on ${cleanTarget}`,
        url: googleSearch(`site:${cleanTarget}`),
        note: "Publicly indexed pages on the domain.",
        type: "domain"
      }),
      makeSearchSource({
        title: `Certificate transparency for ${cleanTarget}`,
        url: `https://crt.sh/?q=${encodedTarget}`,
        note: "Certificate transparency records can reveal subdomains.",
        type: "domain"
      })
    );
  }

  if (detectedType === "url") {
    const firstUrl = detectFirstUrl(cleanTarget);
    let host = "";
    try {
      host = new URL(firstUrl).hostname;
    } catch {}
    if (host) {
      links.push(
        makeSearchSource({
          title: `Domain context for ${host}`,
          url: googleSearch(`site:${host}`),
          note: "Public context for the URL's host.",
          type: "domain"
        })
      );
    }
  }

  if (detectedType === "image") {
    links.push(
      makeSearchSource({
        title: "TinEye manual reverse-image search",
        url: "https://tineye.com/",
        note: "Manual external upload step. Attach the original locally before using outside tools.",
        type: "image"
      }),
      makeSearchSource({
        title: "Google Lens manual image search",
        url: "https://lens.google.com/",
        note: "Manual external upload step. Keep original evidence in Argus.",
        type: "image"
      })
    );
  }

  return links;
}

export function getInvestigationTemplate(templateId = "blank") {
  return INVESTIGATION_TEMPLATES.find((template) => template.id === templateId) || INVESTIGATION_TEMPLATES[0];
}

export function createMemory({
  text,
  tags = [],
  source = "manual",
  priority = "normal",
  type = "note",
  sensitivity = "normal",
  createdAt = nowIso()
}) {
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
    type: normalizeMemoryType(type),
    sensitivity: normalizeMemorySensitivity(sensitivity),
    createdAt,
    updatedAt: createdAt
  };
}

export function createInvestigation({
  title,
  summary = "",
  status = "active",
  target = "",
  targetType = "auto",
  templateId = "blank",
  checklist = null,
  createdAt = nowIso()
}) {
  const cleanTitle = String(title || "").trim();
  if (!cleanTitle) {
    throw new Error("Investigation title is required.");
  }
  const template = getInvestigationTemplate(templateId);
  const cleanTarget = String(target || "").trim();
  const requestedTargetType = String(targetType || "auto");
  const resolvedTargetType =
    requestedTargetType === "auto" && template.id !== "blank" ? template.targetType : requestedTargetType;

  return {
    id: createId("case"),
    title: cleanTitle,
    summary: String(summary || template.summary || "").trim(),
    status,
    target: cleanTarget,
    targetType: normalizeOsintTargetType(resolvedTargetType, cleanTarget || cleanTitle),
    templateId: template.id,
    checklist: Array.isArray(checklist) ? checklist.map(String).filter(Boolean) : [...template.checklist],
    sources: [],
    createdAt,
    updatedAt: createdAt
  };
}

export function createSource({
  url,
  title = "",
  note = "",
  type = "link",
  reliability = "unknown",
  tags = [],
  createdAt = nowIso()
}) {
  const cleanUrl = String(url || "").trim();
  if (!cleanUrl) {
    throw new Error("Source URL is required.");
  }

  return {
    id: createId("src"),
    url: cleanUrl,
    title: String(title || "").trim() || cleanUrl,
    note: String(note || "").trim(),
    type: normalizeSourceType(type),
    reliability: normalizeSourceReliability(reliability),
    tags: normalizeTags(tags),
    createdAt
  };
}

export function createEvidence({
  investigationId,
  title = "",
  note = "",
  fileName = "",
  mimeType = "",
  fileSize = 0,
  blob = null,
  sourceId = "",
  tags = [],
  createdAt = nowIso()
}) {
  const cleanInvestigationId = String(investigationId || "").trim();
  const cleanTitle = String(title || fileName || "").trim();
  const cleanNote = String(note || "").trim();
  if (!cleanInvestigationId) {
    throw new Error("Evidence must belong to an investigation.");
  }
  if (!cleanTitle && !cleanNote) {
    throw new Error("Evidence needs a title, note or file.");
  }

  return {
    id: createId("ev"),
    investigationId: cleanInvestigationId,
    sourceId: String(sourceId || "").trim(),
    title: cleanTitle || "Evidence note",
    note: cleanNote,
    fileName: String(fileName || "").trim(),
    mimeType: String(mimeType || "").trim(),
    fileSize: Number(fileSize || 0),
    blob,
    tags: normalizeTags(tags),
    createdAt,
    updatedAt: createdAt
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
      note: "Create cases, attach source links and keep working notes."
    }),
    createTool({
      name: "OSINT Lead Builder",
      category: "osint",
      status: "ready",
      note: "Start username, email, domain and image metadata cases with local checklists."
    }),
    createTool({
      name: "Evidence Locker",
      category: "osint",
      status: "ready",
      note: "Attach local files, screenshots and evidence notes to cases."
    }),
    createTool({
      name: "Local Search",
      category: "memory",
      status: "ready",
      note: "Search across memory, investigations, sources, evidence and voice notes."
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

export function summarizeStats({
  memory = [],
  investigations = [],
  tools = [],
  voiceNotes = [],
  actions = [],
  evidence = []
}) {
  const sourceCount = investigations.reduce((count, item) => count + (item.sources?.length || 0), 0);
  return {
    memories: memory.length,
    investigations: investigations.length,
    sources: sourceCount,
    evidence: evidence.length,
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
    evidence: Array.isArray(safe.evidence) ? safe.evidence : [],
    settings: Array.isArray(safe.settings) ? safe.settings : [],
    events: Array.isArray(safe.events) ? safe.events : []
  };
}

function normalizeSearchText(value) {
  return String(value || "").toLowerCase();
}

function scoreSearchText(text, query) {
  const cleanText = normalizeSearchText(text);
  const cleanQuery = normalizeSearchText(query).trim();
  if (!cleanQuery) return 0;

  const tokens = cleanQuery.split(/\s+/).filter(Boolean);
  let score = cleanText.includes(cleanQuery) ? 4 : 0;
  for (const token of tokens) {
    if (cleanText.includes(token)) score += 1;
  }
  return score;
}

function pushSearchResult(results, query, item) {
  const score = scoreSearchText([item.title, item.detail, item.meta].join(" "), query);
  if (score > 0) {
    results.push({ ...item, score });
  }
}

export function searchLocalRecords(
  { memory = [], investigations = [], tools = [], voiceNotes = [], actions = [], evidence = [] },
  query
) {
  const results = [];
  for (const item of memory) {
    pushSearchResult(results, query, {
      kind: "memory",
      id: item.id,
      title: item.text,
      detail: `${item.type || "note"} memory · ${item.priority || "normal"} priority`,
      meta: [...(item.tags || []), item.source, item.sensitivity].join(" "),
      createdAt: item.createdAt
    });
  }

  for (const item of investigations) {
    pushSearchResult(results, query, {
      kind: "case",
      id: item.id,
      title: item.title,
      detail: item.summary || item.target || "Investigation case",
      meta: [item.status, item.targetType, item.target, ...(item.checklist || [])].join(" "),
      createdAt: item.createdAt
    });

    for (const source of item.sources || []) {
      pushSearchResult(results, query, {
        kind: "source",
        id: source.id,
        parentId: item.id,
        title: source.title || source.url,
        detail: source.note || source.url,
        meta: [item.title, source.type, source.reliability, ...(source.tags || [])].join(" "),
        createdAt: source.createdAt
      });
    }
  }

  for (const item of evidence) {
    pushSearchResult(results, query, {
      kind: "evidence",
      id: item.id,
      parentId: item.investigationId,
      title: item.title || item.fileName,
      detail: item.note || item.fileName || "Evidence record",
      meta: [item.mimeType, item.fileName, ...(item.tags || [])].join(" "),
      createdAt: item.createdAt
    });
  }

  for (const item of voiceNotes) {
    pushSearchResult(results, query, {
      kind: "voice",
      id: item.id,
      title: item.title,
      detail: item.transcript || item.mimeType || "Voice note",
      meta: item.mimeType,
      createdAt: item.createdAt
    });
  }

  for (const item of tools) {
    pushSearchResult(results, query, {
      kind: "tool",
      id: item.id,
      title: item.name,
      detail: item.note || item.url || "Tool record",
      meta: [item.category, item.status].join(" "),
      createdAt: item.createdAt
    });
  }

  for (const item of actions) {
    pushSearchResult(results, query, {
      kind: "action",
      id: item.id,
      title: item.title,
      detail: typeof item.payload === "string" ? item.payload : JSON.stringify(item.payload || {}),
      meta: [item.capability, item.status, item.sensitivity].join(" "),
      createdAt: item.createdAt
    });
  }

  return results.sort((a, b) => b.score - a.score || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
}

export function reviewMemoryRecords(memory = [], referenceDate = new Date()) {
  const now = referenceDate instanceof Date ? referenceDate : new Date(referenceDate);
  const textCounts = new Map();
  for (const item of memory) {
    const key = String(item.text || "").trim().toLowerCase();
    if (key) textCounts.set(key, (textCounts.get(key) || 0) + 1);
  }

  const stale = [];
  const duplicates = [];
  const sensitive = [];
  for (const item of memory) {
    const updatedAt = new Date(item.updatedAt || item.createdAt || 0);
    const ageDays = Number.isFinite(updatedAt.valueOf()) ? (now - updatedAt) / 86400000 : 0;
    const key = String(item.text || "").trim().toLowerCase();
    if (ageDays >= 90) stale.push(item);
    if (key && (textCounts.get(key) || 0) > 1) duplicates.push(item);
    if (item.sensitivity && item.sensitivity !== "normal") sensitive.push(item);
  }

  return { stale, duplicates, sensitive };
}
