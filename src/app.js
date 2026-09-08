import {
  ANDROID_BRIDGE_CAPABILITIES,
  ARGUS_VERSION,
  MODULES,
  classifyCapture,
  createAction,
  createEvent,
  createInvestigation,
  createMemory,
  createSource,
  createTool,
  createVoiceNote,
  getSeedTools,
  normalizeTags,
  summarizeStats
} from "./argus-core.js";
import { dispatchNativeAction, readNativeBridgeInfo, registerNativeInbox } from "./android-bridge.js";
import { CURRENT_ANDROID_BUILD, checkForUpdate } from "./updater.js";
import {
  clearStore,
  deleteRecord,
  exportArgusData,
  importArgusData,
  listRecords,
  putRecord,
  STORES
} from "./db.js";

const app = document.querySelector("#app");
const navItems = [
  { id: "dashboard", label: "Dashboard" },
  { id: "memory", label: "Memory" },
  { id: "investigations", label: "Investigations" },
  { id: "tools", label: "Tools" },
  { id: "voice", label: "Voice" },
  { id: "bridge", label: "Bridge" },
  { id: "settings", label: "Settings" }
];

const state = {
  activeView: "dashboard",
  dbReady: false,
  memory: [],
  investigations: [],
  tools: [],
  voiceNotes: [],
  actions: [],
  settings: [],
  events: [],
  memoryQuery: "",
  toast: "",
  recording: null,
  sharedDraft: null,
  bridgeInfo: readNativeBridgeInfo()
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeLink(url) {
  try {
    const parsed = new URL(url);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.toString() : "#";
  } catch {
    return "#";
  }
}

function formatDate(value) {
  if (!value) return "Unknown date";
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function setToast(message) {
  state.toast = message;
  render();
  window.clearTimeout(setToast.timer);
  setToast.timer = window.setTimeout(() => {
    state.toast = "";
    render();
  }, 3200);
}

async function logEvent(type, detail) {
  await putRecord("events", createEvent({ type, detail }));
}

async function loadData() {
  state.memory = await listRecords("memory");
  state.investigations = await listRecords("investigations");
  state.tools = await listRecords("tools");
  state.voiceNotes = await listRecords("voiceNotes");
  state.actions = await listRecords("actions");
  state.settings = await listRecords("settings");
  state.events = await listRecords("events");
}

async function ensureSeedData() {
  const tools = await listRecords("tools");
  if (tools.length === 0) {
    for (const tool of getSeedTools()) {
      await putRecord("tools", tool);
    }
    await logEvent("seed", "Installed Argus seed tools.");
  }
}

function readShareParams() {
  const params = new URLSearchParams(window.location.search);
  const isShareLaunch = params.has("shared") || window.location.pathname.endsWith("/share-target");
  if (!isShareLaunch) return null;

  const title = params.get("title") || "";
  const text = params.get("text") || "";
  const url = params.get("url") || "";
  const combined = [title, text, url].filter(Boolean).join("\n");
  return combined ? combined.trim() : null;
}

async function handleSharedLaunch() {
  const draft = readShareParams();
  if (!draft) return;

  state.sharedDraft = draft;
  state.activeView = "dashboard";
  await logEvent("share-target", "Argus opened from a shared item.");
  window.history.replaceState({}, document.title, "./index.html");
}

function statCount(view) {
  if (view === "memory") return state.memory.length;
  if (view === "investigations") return state.investigations.length;
  if (view === "tools") return state.tools.length;
  if (view === "voice") return state.voiceNotes.length;
  if (view === "bridge") return state.actions.filter((action) => action.status !== "completed").length;
  return "";
}

function renderShell(content) {
  const onlineLabel = navigator.onLine ? "Online capable" : "Offline mode";
  return `
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark">A</div>
        <div class="brand-text">
          <strong>Argus</strong>
          <span>v${ARGUS_VERSION} local core for Android-first work</span>
        </div>
      </div>
      <div class="status-pill" title="Argus data is stored locally on this device.">
        <span class="status-dot"></span>
        ${onlineLabel}
      </div>
    </header>
    <div class="layout">
      <nav class="sidebar" aria-label="Argus sections">
        ${navItems
          .map(
            (item) => `
              <button class="nav-button" data-view="${item.id}" aria-current="${state.activeView === item.id ? "page" : "false"}">
                <span>${item.label}</span>
                <span class="nav-count">${statCount(item.id)}</span>
              </button>
            `
          )
          .join("")}
      </nav>
      <main class="workspace">${content}</main>
    </div>
    ${state.toast ? `<div class="toast" role="status">${escapeHtml(state.toast)}</div>` : ""}
  `;
}

function renderQuickCapture() {
  return `
    <section class="band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Quick Capture</p>
          <h1>Drop something into Argus</h1>
          <p>Notes, links and early case ideas stay local until you choose to export them.</p>
        </div>
      </div>
      <form class="quick-capture" data-form="quick-capture">
        <label class="field">
          <span>Capture</span>
          <textarea class="textarea" name="text" placeholder="Paste a lead, thought, link, checklist item or rough note.">${escapeHtml(
            state.sharedDraft || ""
          )}</textarea>
        </label>
        <div class="field-grid">
          <label class="field">
            <span>Route</span>
            <select class="select" name="route">
              <option value="auto">Auto detect</option>
              <option value="memory">Memory note</option>
              <option value="investigation">New investigation</option>
              <option value="source">Source link</option>
              <option value="action">Action draft</option>
            </select>
          </label>
          <label class="field">
            <span>Tags</span>
            <input class="input" name="tags" placeholder="osint, personal, urgent">
          </label>
        </div>
        <div class="actions">
          <button class="button" type="submit">Capture</button>
          ${state.sharedDraft ? `<button class="button quiet" type="button" data-action="clear-shared-draft">Clear shared draft</button>` : ""}
        </div>
      </form>
    </section>
  `;
}

function renderDashboard() {
  const stats = summarizeStats(state);
  return `
    ${renderQuickCapture()}
    <section class="stats-grid" aria-label="Argus local stats">
      ${[
        ["Memory", stats.memories],
        ["Cases", stats.investigations],
        ["Sources", stats.sources],
        ["Voice", stats.voiceNotes],
        ["Actions", stats.pendingActions]
      ]
        .map(
          ([label, value]) => `
            <div class="card stat">
              <strong>${value}</strong>
              <span>${label}</span>
            </div>
          `
        )
        .join("")}
    </section>
    <section class="band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Capability Map</p>
          <h2>Modules in the first foundation</h2>
          <p>Ready modules work now. Stub and planned modules mark the Android-native path without faking permissions.</p>
        </div>
      </div>
      <div class="module-grid">
        ${MODULES.map(renderModuleCard).join("")}
      </div>
    </section>
  `;
}

function renderModuleCard(module) {
  return `
    <article class="card module-card">
      <header>
        <div>
          <h3>${escapeHtml(module.name)}</h3>
          <p>${escapeHtml(module.category)}</p>
        </div>
        <span class="status ${escapeHtml(module.status)}">${escapeHtml(module.status)}</span>
      </header>
      <p>${escapeHtml(module.description)}</p>
      <div class="tag-row">
        <span class="tag">${module.localFirst ? "local-first" : "cloud-adapter"}</span>
        <span class="tag">${module.requiresAndroidBridge ? "android bridge" : "web core"}</span>
      </div>
    </article>
  `;
}

function renderMemory() {
  const query = state.memoryQuery.trim().toLowerCase();
  const filtered = query
    ? state.memory.filter((item) =>
        [item.text, ...(item.tags || [])].join(" ").toLowerCase().includes(query)
      )
    : state.memory;

  return `
    <section class="band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Memory</p>
          <h1>Local memory bank</h1>
          <p>Fast notes and useful context, stored on this device.</p>
        </div>
      </div>
      <form class="quick-capture" data-form="memory">
        <label class="field">
          <span>New memory</span>
          <textarea class="textarea" name="text" placeholder="What should Argus remember?"></textarea>
        </label>
        <div class="field-grid">
          <label class="field">
            <span>Tags</span>
            <input class="input" name="tags" placeholder="project, person, idea">
          </label>
          <label class="field">
            <span>Priority</span>
            <select class="select" name="priority">
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
          </label>
        </div>
        <button class="button" type="submit">Save Memory</button>
      </form>
    </section>
    <section class="band">
      <div class="section-head">
        <div>
          <h2>Saved memories</h2>
          <p>${filtered.length} shown from ${state.memory.length} total.</p>
        </div>
      </div>
      <form class="quick-capture" data-form="memory-search">
        <label class="field">
          <span>Search memory</span>
          <input class="input" name="query" value="${escapeHtml(state.memoryQuery)}" placeholder="Search notes or tags">
        </label>
      </form>
      <div class="list-grid">
        ${filtered.length ? filtered.map(renderMemoryCard).join("") : `<p class="empty">No memory notes yet.</p>`}
      </div>
    </section>
  `;
}

function renderMemoryCard(item) {
  return `
    <article class="card item-card">
      <header>
        <div>
          <h3>${escapeHtml(formatDate(item.createdAt))}</h3>
          <p>${escapeHtml(item.priority || "normal")} priority</p>
        </div>
        <button class="button quiet" type="button" data-action="delete-memory" data-id="${escapeHtml(item.id)}">Delete</button>
      </header>
      <p>${escapeHtml(item.text)}</p>
      <div class="tag-row">
        ${(item.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("") || `<span class="tag">untagged</span>`}
      </div>
    </article>
  `;
}

function renderInvestigations() {
  return `
    <section class="band">
      <div class="section-head">
        <div>
          <p class="eyebrow">OSINT</p>
          <h1>Investigation board</h1>
          <p>Start cases small: a title, a working note and traceable source links.</p>
        </div>
      </div>
      <form class="quick-capture" data-form="investigation">
        <div class="field-grid">
          <label class="field">
            <span>Case title</span>
            <input class="input" name="title" placeholder="Example: Username research">
          </label>
          <label class="field">
            <span>Status</span>
            <select class="select" name="status">
              <option value="active">Active</option>
              <option value="watching">Watching</option>
              <option value="closed">Closed</option>
            </select>
          </label>
        </div>
        <label class="field">
          <span>Working note</span>
          <textarea class="textarea" name="summary" placeholder="What is this case trying to answer?"></textarea>
        </label>
        <button class="button" type="submit">Create Case</button>
      </form>
    </section>
    <div class="list-grid">
      ${state.investigations.length ? state.investigations.map(renderInvestigationCard).join("") : `<p class="empty">No investigations yet.</p>`}
    </div>
  `;
}

function renderInvestigationCard(item) {
  return `
    <article class="card item-card">
      <header>
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.status)} · ${escapeHtml(formatDate(item.createdAt))}</p>
        </div>
        <button class="button quiet" type="button" data-action="delete-investigation" data-id="${escapeHtml(item.id)}">Delete</button>
      </header>
      ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
      <ul class="source-list">
        ${(item.sources || []).map(renderSourceItem).join("") || `<li><p>No sources attached yet.</p></li>`}
      </ul>
      <form class="quick-capture" data-form="source">
        <input type="hidden" name="investigationId" value="${escapeHtml(item.id)}">
        <div class="field-grid">
          <label class="field">
            <span>Source URL</span>
            <input class="input" name="url" placeholder="https://example.com/source">
          </label>
          <label class="field">
            <span>Title</span>
            <input class="input" name="title" placeholder="Optional source title">
          </label>
        </div>
        <label class="field">
          <span>Note</span>
          <input class="input" name="note" placeholder="Why this source matters">
        </label>
        <button class="button secondary" type="submit">Attach Source</button>
      </form>
    </article>
  `;
}

function renderSourceItem(source) {
  const href = safeLink(source.url);
  return `
    <li>
      <a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(source.title || source.url)}</a>
      ${source.note ? `<p>${escapeHtml(source.note)}</p>` : ""}
      <div class="tag-row">
        <span class="tag">${escapeHtml(source.type || "link")}</span>
        <span class="tag">${escapeHtml(formatDate(source.createdAt))}</span>
      </div>
    </li>
  `;
}

function renderTools() {
  return `
    <section class="band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Tools</p>
          <h1>Capability registry</h1>
          <p>Track what Argus can do now and what needs the Android bridge later.</p>
        </div>
      </div>
      <form class="quick-capture" data-form="tool">
        <div class="field-grid">
          <label class="field">
            <span>Tool name</span>
            <input class="input" name="name" placeholder="Example: Reverse image search">
          </label>
          <label class="field">
            <span>Category</span>
            <input class="input" name="category" placeholder="osint, voice, automation">
          </label>
        </div>
        <div class="field-grid">
          <label class="field">
            <span>Status</span>
            <select class="select" name="status">
              <option value="manual">Manual</option>
              <option value="ready">Ready</option>
              <option value="stub">Stub</option>
              <option value="planned">Planned</option>
            </select>
          </label>
          <label class="field">
            <span>URL</span>
            <input class="input" name="url" placeholder="Optional local or web link">
          </label>
        </div>
        <label class="field">
          <span>Note</span>
          <input class="input" name="note" placeholder="How this tool should be used">
        </label>
        <button class="button" type="submit">Add Tool</button>
      </form>
    </section>
    <div class="module-grid">
      ${state.tools.map(renderToolCard).join("")}
    </div>
  `;
}

function renderToolCard(tool) {
  return `
    <article class="card module-card">
      <header>
        <div>
          <h3>${escapeHtml(tool.name)}</h3>
          <p>${escapeHtml(tool.category)}</p>
        </div>
        <span class="status ${escapeHtml(tool.status)}">${escapeHtml(tool.status)}</span>
      </header>
      ${tool.note ? `<p>${escapeHtml(tool.note)}</p>` : ""}
      <div class="actions">
        ${tool.url ? `<a class="button secondary" href="${escapeHtml(safeLink(tool.url))}" target="_blank" rel="noreferrer">Open</a>` : ""}
        <button class="button quiet" type="button" data-action="delete-tool" data-id="${escapeHtml(tool.id)}">Delete</button>
      </div>
    </article>
  `;
}

function renderVoice() {
  const canRecord = Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
  return `
    <section class="band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Voice</p>
          <h1>Voice notes</h1>
          <p>Record short thoughts locally. Transcription becomes a local model adapter later.</p>
        </div>
      </div>
      <div class="recorder">
        <div>
          <strong>${state.recording ? "Recording now" : canRecord ? "Ready to record" : "Recording unavailable"}</strong>
          <p>${state.recording ? "Stop when the note is finished." : canRecord ? "Your browser will ask for microphone permission." : "This browser does not expose MediaRecorder."}</p>
        </div>
        ${state.recording ? `<span class="pulse" aria-hidden="true"></span>` : ""}
        <div class="actions">
          ${
            state.recording
              ? `<button class="button danger" type="button" data-action="stop-recording">Stop</button>`
              : `<button class="button" type="button" data-action="start-recording" ${canRecord ? "" : "disabled"}>Record</button>`
          }
        </div>
      </div>
    </section>
    <div class="list-grid">
      ${state.voiceNotes.length ? state.voiceNotes.map(renderVoiceNoteCard).join("") : `<p class="empty">No voice notes yet.</p>`}
    </div>
  `;
}

function renderVoiceNoteCard(note) {
  const audioUrl = note.blob ? URL.createObjectURL(note.blob) : "";
  return `
    <article class="card item-card">
      <header>
        <div>
          <h3>${escapeHtml(note.title)}</h3>
          <p>${escapeHtml(formatDate(note.createdAt))}</p>
        </div>
        <button class="button quiet" type="button" data-action="delete-voice" data-id="${escapeHtml(note.id)}">Delete</button>
      </header>
      ${audioUrl ? `<audio controls src="${escapeHtml(audioUrl)}"></audio>` : `<p>No audio blob found for this note.</p>`}
      ${note.transcript ? `<p>${escapeHtml(note.transcript)}</p>` : ""}
      <div class="tag-row">
        <span class="tag">${escapeHtml(note.mimeType || "audio")}</span>
        <span class="tag">local</span>
      </div>
    </article>
  `;
}

function renderBridge() {
  const bridge = state.bridgeInfo || readNativeBridgeInfo();
  return `
    <section class="band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Android Bridge</p>
          <h1>Action queue</h1>
          <p>Draft phone actions locally, confirm them, then dispatch only when a native bridge is attached.</p>
        </div>
        <span class="status ${bridge.available ? "ready" : "stub"}">${bridge.available ? "attached" : "web core"}</span>
      </div>
      <form class="quick-capture" data-form="action">
        <div class="field-grid">
          <label class="field">
            <span>Action title</span>
            <input class="input" name="title" placeholder="Example: Open saved source">
          </label>
          <label class="field">
            <span>Capability</span>
            <select class="select" name="capability">
              ${ANDROID_BRIDGE_CAPABILITIES.map(
                (capability) => `<option value="${escapeHtml(capability.id)}">${escapeHtml(capability.name)}</option>`
              ).join("")}
            </select>
          </label>
        </div>
        <div class="field-grid">
          <label class="field">
            <span>Sensitivity</span>
            <select class="select" name="sensitivity">
              <option value="normal">Normal</option>
              <option value="low">Low</option>
              <option value="high">High</option>
            </select>
          </label>
          <label class="field">
            <span>Status</span>
            <input class="input" value="Draft, confirm before dispatch" disabled>
          </label>
        </div>
        <label class="field">
          <span>Payload</span>
          <textarea class="textarea" name="payload" placeholder='Plain text or JSON, for example {"url":"https://example.com"}'></textarea>
        </label>
        <button class="button" type="submit">Queue Action</button>
      </form>
    </section>
    <section class="band">
      <div class="section-head">
        <div>
          <h2>Bridge capabilities</h2>
          <p>${escapeHtml(bridge.message || "Native bridge state loaded.")}</p>
        </div>
      </div>
      <div class="module-grid">
        ${ANDROID_BRIDGE_CAPABILITIES.map(renderCapabilityCard).join("")}
      </div>
    </section>
    <div class="list-grid">
      ${state.actions.length ? state.actions.map(renderActionCard).join("") : `<p class="empty">No queued actions yet.</p>`}
    </div>
  `;
}

function renderCapabilityCard(capability) {
  return `
    <article class="card module-card">
      <header>
        <div>
          <h3>${escapeHtml(capability.name)}</h3>
          <p>${escapeHtml(capability.sensitivity)} sensitivity</p>
        </div>
        <span class="status ${escapeHtml(capability.status)}">${escapeHtml(capability.status)}</span>
      </header>
      <p>${escapeHtml(capability.description)}</p>
    </article>
  `;
}

function renderActionCard(action) {
  const status = String(action.status || "draft");
  return `
    <article class="card item-card">
      <header>
        <div>
          <h3>${escapeHtml(action.title)}</h3>
          <p>${escapeHtml(action.capability)} · ${escapeHtml(formatDate(action.createdAt))}</p>
        </div>
        <span class="status ${escapeHtml(status)}">${escapeHtml(status.replaceAll("_", " "))}</span>
      </header>
      <p>${escapeHtml(renderPayloadSummary(action.payload))}</p>
      ${action.lastResult ? `<p>${escapeHtml(action.lastResult)}</p>` : ""}
      <div class="tag-row">
        <span class="tag">${escapeHtml(action.sensitivity || "normal")}</span>
        <span class="tag">${action.requiresConfirmation ? "confirmation required" : "direct"}</span>
      </div>
      <div class="actions">
        ${
          status === "draft"
            ? `<button class="button secondary" type="button" data-action="approve-action" data-id="${escapeHtml(action.id)}">Approve</button>`
            : ""
        }
        ${
          status === "approved" || status === "waiting_for_bridge"
            ? `<button class="button" type="button" data-action="dispatch-action" data-id="${escapeHtml(action.id)}">Dispatch</button>`
            : ""
        }
        ${
          status !== "completed"
            ? `<button class="button quiet" type="button" data-action="complete-action" data-id="${escapeHtml(action.id)}">Mark Done</button>`
            : ""
        }
        <button class="button quiet" type="button" data-action="delete-action" data-id="${escapeHtml(action.id)}">Delete</button>
      </div>
    </article>
  `;
}

function renderPayloadSummary(payload) {
  if (payload == null) return "No payload.";
  if (typeof payload === "string") return payload;
  if (typeof payload.text === "string") return payload.text;
  if (typeof payload.url === "string") return payload.url;
  return JSON.stringify(payload);
}

function renderSettings() {
  const updateManifestUrl = getSettingValue("updateManifestUrl", "./update.json");
  return `
    <section class="band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Settings</p>
          <h1>Local data controls</h1>
          <p>Export, import or clear this device's Argus data.</p>
        </div>
      </div>
      <div class="actions">
        <button class="button" type="button" data-action="export-data">Export JSON</button>
        <button class="button quiet" type="button" data-action="wipe-data">Wipe Local Data</button>
      </div>
      <form class="quick-capture" data-form="import-data">
        <label class="field">
          <span>Import backup</span>
          <input class="input" type="file" name="backup" accept="application/json">
        </label>
        <button class="button secondary" type="submit">Import JSON</button>
      </form>
    </section>
    <section class="band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Updates</p>
          <h2>APK update channel</h2>
          <p>Current Android build: ${escapeHtml(CURRENT_ANDROID_BUILD.versionName)} (${CURRENT_ANDROID_BUILD.versionCode}). Android will ask before installing any APK.</p>
        </div>
      </div>
      <form class="quick-capture" data-form="update-settings">
        <label class="field">
          <span>Update manifest URL</span>
          <input class="input" name="manifestUrl" value="${escapeHtml(updateManifestUrl)}" placeholder="https://example.com/argus/update.json">
        </label>
        <div class="actions">
          <button class="button secondary" type="submit">Save Update URL</button>
          <button class="button" type="button" data-action="check-updates">Check For Update</button>
        </div>
      </form>
    </section>
    <section class="band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Android Path</p>
          <h2>Next native work</h2>
          <p>The native shell will add phone permissions while this local core keeps the app logic clean.</p>
        </div>
      </div>
      <div class="module-grid">
        ${MODULES.filter((module) => module.requiresAndroidBridge).map(renderModuleCard).join("")}
      </div>
    </section>
  `;
}

function getSettingValue(id, fallback = "") {
  const record = state.settings.find((item) => item.id === id);
  return record?.value ?? fallback;
}

async function saveSetting(id, value) {
  const existing = state.settings.find((item) => item.id === id);
  await putRecord("settings", {
    id,
    value,
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function render() {
  const views = {
    dashboard: renderDashboard,
    memory: renderMemory,
    investigations: renderInvestigations,
    tools: renderTools,
    voice: renderVoice,
    bridge: renderBridge,
    settings: renderSettings
  };
  app.innerHTML = renderShell((views[state.activeView] || renderDashboard)());
}

async function handleQuickCapture(form) {
  const formData = new FormData(form);
  const text = String(formData.get("text") || "").trim();
  const route = formData.get("route");
  const tags = normalizeTags(formData.get("tags"));
  if (!text) return;

  const classification = route === "auto" ? classifyCapture(text) : { type: route };

  if (classification.type === "investigation") {
    await putRecord("investigations", createInvestigation({ title: text.slice(0, 80), summary: text }));
    await logEvent("capture", "Created investigation from quick capture.");
    state.activeView = "investigations";
  } else if (classification.type === "source") {
    const investigation = state.investigations[0] || createInvestigation({ title: "Inbox Sources", summary: "Shared and captured source links." });
    if (!state.investigations[0]) {
      await putRecord("investigations", investigation);
    }
    investigation.sources = [
      createSource({
        url: classification.url || text,
        title: classification.url ? classification.url : text.slice(0, 80),
        note: text
      }),
      ...(investigation.sources || [])
    ];
    investigation.updatedAt = new Date().toISOString();
    await putRecord("investigations", investigation);
    await logEvent("capture", "Attached source from quick capture.");
    state.activeView = "investigations";
  } else if (classification.type === "task" || classification.type === "action") {
    await putRecord(
      "actions",
      createAction({
        title: text.slice(0, 80),
        capability: "local_reminder",
        payload: { text, tags },
        sensitivity: "normal"
      })
    );
    await logEvent("capture", "Created action draft from quick capture.");
    state.activeView = "bridge";
  } else {
    await putRecord("memory", createMemory({ text, tags, source: "quick-capture" }));
    await logEvent("capture", "Created memory from quick capture.");
    state.activeView = "memory";
  }

  state.sharedDraft = null;
  await loadData();
  setToast("Captured locally.");
}

async function handleMemory(form) {
  const formData = new FormData(form);
  await putRecord(
    "memory",
    createMemory({
      text: formData.get("text"),
      tags: formData.get("tags"),
      priority: formData.get("priority")
    })
  );
  await logEvent("memory", "Saved memory note.");
  await loadData();
  setToast("Memory saved.");
}

async function handleInvestigation(form) {
  const formData = new FormData(form);
  await putRecord(
    "investigations",
    createInvestigation({
      title: formData.get("title"),
      summary: formData.get("summary"),
      status: formData.get("status")
    })
  );
  await logEvent("investigation", "Created investigation.");
  await loadData();
  setToast("Case created.");
}

async function handleSource(form) {
  const formData = new FormData(form);
  const investigation = state.investigations.find((item) => item.id === formData.get("investigationId"));
  if (!investigation) return;

  investigation.sources = [
    createSource({
      url: formData.get("url"),
      title: formData.get("title"),
      note: formData.get("note")
    }),
    ...(investigation.sources || [])
  ];
  investigation.updatedAt = new Date().toISOString();
  await putRecord("investigations", investigation);
  await logEvent("source", `Attached source to ${investigation.title}.`);
  await loadData();
  setToast("Source attached.");
}

async function handleTool(form) {
  const formData = new FormData(form);
  await putRecord(
    "tools",
    createTool({
      name: formData.get("name"),
      category: formData.get("category"),
      status: formData.get("status"),
      url: formData.get("url"),
      note: formData.get("note")
    })
  );
  await logEvent("tool", "Added tool.");
  await loadData();
  setToast("Tool added.");
}

function parseActionPayload(value) {
  const text = String(value || "").trim();
  if (!text) return {};
  if (text.startsWith("{") || text.startsWith("[")) {
    return JSON.parse(text);
  }
  return { text };
}

async function handleAction(form) {
  const formData = new FormData(form);
  await putRecord(
    "actions",
    createAction({
      title: formData.get("title"),
      capability: formData.get("capability"),
      payload: parseActionPayload(formData.get("payload")),
      sensitivity: formData.get("sensitivity")
    })
  );
  await logEvent("action", "Queued bridge action.");
  await loadData();
  setToast("Action queued.");
}

async function handleImport(form) {
  const file = form.elements.backup.files?.[0];
  if (!file) return;
  const payload = JSON.parse(await file.text());
  await importArgusData(payload);
  await logEvent("import", `Imported ${file.name}.`);
  await loadData();
  setToast("Backup imported.");
}

async function handleUpdateSettings(form) {
  const manifestUrl = String(new FormData(form).get("manifestUrl") || "").trim() || "./update.json";
  await saveSetting("updateManifestUrl", manifestUrl);
  await logEvent("settings", "Saved update manifest URL.");
  await loadData();
  setToast("Update URL saved.");
}

async function checkUpdates() {
  const manifestUrl = getSettingValue("updateManifestUrl", "./update.json") || "./update.json";
  const result = await checkForUpdate(manifestUrl);
  if (!result.updateAvailable) {
    setToast(`Argus is current at ${result.current.versionName}.`);
    return;
  }

  if (!result.manifest.apkUrl) {
    setToast(`Update ${result.manifest.versionName} exists, but no APK URL is set.`);
    return;
  }

  await putRecord(
    "actions",
    createAction({
      title: `Install Argus ${result.manifest.versionName}`,
      capability: "apk_update",
      payload: {
        url: result.manifest.apkUrl,
        sha256: result.manifest.sha256,
        versionCode: result.manifest.versionCode,
        versionName: result.manifest.versionName
      },
      sensitivity: "high"
    })
  );
  await logEvent("update", `Queued Argus ${result.manifest.versionName} APK update.`);
  await loadData();
  state.activeView = "bridge";
  setToast("Update queued for confirmation.");
}

async function exportData() {
  const data = await exportArgusData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `argus-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  await logEvent("export", "Exported Argus local data.");
  await loadData();
  setToast("Backup exported.");
}

async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    const startedAt = Date.now();

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunks.push(event.data);
    };

    recorder.onstop = async () => {
      const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
      stream.getTracks().forEach((track) => track.stop());
      await putRecord(
        "voiceNotes",
        createVoiceNote({
          mimeType: blob.type,
          durationMs: Date.now() - startedAt,
          blob
        })
      );
      await logEvent("voice", "Saved voice note.");
      state.recording = null;
      await loadData();
      setToast("Voice note saved locally.");
    };

    state.recording = { recorder, stream, startedAt };
    recorder.start();
    render();
  } catch (error) {
    setToast(error?.message || "Could not start recording.");
  }
}

function stopRecording() {
  if (state.recording?.recorder?.state === "recording") {
    state.recording.recorder.stop();
  }
}

async function wipeData() {
  const confirmed = window.confirm("Clear all local Argus data on this device?");
  if (!confirmed) return;
  for (const store of STORES) {
    await clearStore(store);
  }
  await ensureSeedData();
  await loadData();
  setToast("Local data cleared.");
}

async function updateAction(id, patch, message) {
  const action = state.actions.find((item) => item.id === id);
  if (!action) return;
  const updated = {
    ...action,
    ...patch,
    updatedAt: new Date().toISOString()
  };
  await putRecord("actions", updated);
  await logEvent("action", message);
  await loadData();
  setToast(message);
}

async function dispatchAction(id) {
  const action = state.actions.find((item) => item.id === id);
  if (!action) return;
  const result = await dispatchNativeAction(action);
  await updateAction(
    id,
    {
      status: result.status,
      lastResult: result.message
    },
    result.dispatched ? "Action dispatched." : "Action held locally."
  );
}

app.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    state.activeView = viewButton.dataset.view;
    render();
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const { action, id } = actionButton.dataset;
  try {
  if (action === "clear-shared-draft") {
    state.sharedDraft = null;
    render();
  }
  if (action === "delete-memory") {
    await deleteRecord("memory", id);
    await loadData();
    setToast("Memory deleted.");
  }
  if (action === "delete-investigation") {
    await deleteRecord("investigations", id);
    await loadData();
    setToast("Case deleted.");
  }
  if (action === "delete-tool") {
    await deleteRecord("tools", id);
    await loadData();
    setToast("Tool deleted.");
  }
  if (action === "delete-voice") {
    await deleteRecord("voiceNotes", id);
    await loadData();
    setToast("Voice note deleted.");
  }
  if (action === "approve-action") {
    await updateAction(id, { status: "approved" }, "Action approved.");
  }
  if (action === "complete-action") {
    await updateAction(id, { status: "completed" }, "Action marked done.");
  }
  if (action === "dispatch-action") {
    await dispatchAction(id);
  }
  if (action === "delete-action") {
    await deleteRecord("actions", id);
    await loadData();
    setToast("Action deleted.");
  }
  if (action === "export-data") {
    await exportData();
  }
  if (action === "wipe-data") {
    await wipeData();
  }
  if (action === "check-updates") {
    await checkUpdates();
  }
  if (action === "start-recording") {
    await startRecording();
  }
  if (action === "stop-recording") {
    stopRecording();
  }
  } catch (error) {
    setToast(error?.message || "Argus could not complete that action.");
  }
});

app.addEventListener("submit", async (event) => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();

  try {
    const formType = form.dataset.form;
    if (formType === "quick-capture") await handleQuickCapture(form);
    if (formType === "memory") await handleMemory(form);
    if (formType === "memory-search") {
      state.memoryQuery = new FormData(form).get("query") || "";
      render();
    }
    if (formType === "investigation") await handleInvestigation(form);
    if (formType === "source") await handleSource(form);
    if (formType === "tool") await handleTool(form);
    if (formType === "action") await handleAction(form);
    if (formType === "update-settings") await handleUpdateSettings(form);
    if (formType === "import-data") await handleImport(form);
  } catch (error) {
    setToast(error?.message || "Argus could not complete that action.");
  }
});

async function init() {
  try {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./service-worker.js").catch(() => {});
    }
    registerNativeInbox(async (text) => {
      state.sharedDraft = text;
      state.activeView = "dashboard";
      if (state.dbReady) {
        await logEvent("native-share", "Received shared text from native bridge.");
        await loadData();
      }
      render();
    });
    await ensureSeedData();
    await loadData();
    await handleSharedLaunch();
    state.dbReady = true;
    render();
  } catch (error) {
    app.innerHTML = `
      <main class="boot-panel">
        <p class="eyebrow">Argus v${ARGUS_VERSION}</p>
        <h1>Local core could not start</h1>
        <p>${escapeHtml(error?.message || "Unknown startup error.")}</p>
      </main>
    `;
  }
}

init();
