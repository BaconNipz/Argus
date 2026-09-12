import {
  ANDROID_BRIDGE_CAPABILITIES,
  ARGUS_VERSION,
  COMMAND_EXAMPLES,
  INVESTIGATION_TEMPLATES,
  MEMORY_SENSITIVITY,
  MEMORY_TYPES,
  MODULES,
  OSINT_TARGET_TYPES,
  SOURCE_RELIABILITY,
  SOURCE_RELATIONSHIPS,
  SOURCE_TYPES,
  buildCaseReview,
  buildEvidenceTimeline,
  buildLinkAnalysis,
  buildOsintSearchLinks,
  classifyCapture,
  createAction,
  createEvidence,
  createEvent,
  createInvestigation,
  createMemory,
  createSource,
  createTool,
  createVoiceNote,
  detectOsintTargetType,
  getSeedTools,
  normalizeTags,
  parseArgusCommand,
  reviewMemoryRecords,
  searchLocalRecords,
  summarizeStats
} from "./argus-core.js";
import { dispatchNativeAction, readNativeBridgeInfo, registerNativeInbox, reminderBridge } from "./android-bridge.js";
import { canHandleReminderAlert, createReminder, mergeNativeReminders, toLocalDateTime } from "./routines.js";
import { beginSpeechCapture, emptySpeechCapture, isSpeechBusy, reduceSpeechCapture, speechBridge } from "./speech.js";
import { beginSpeechOutput, emptySpeechOutput, isOutputBusy, reduceSpeechOutput, ttsBridge } from "./speech-output.js";
import { notificationAdvice } from "./notification-status.js";
import { localStatusReply } from "./command-language.js";
import { commandAccessAvailable, commandAccessBridge, takeCommandLaunch } from "./command-access.js";
import { backgroundVoiceAvailable, backgroundVoiceBridge, canTakeBackgroundWake, hasUnfinishedWakeInput, microphoneLevel, spokenCommandMode } from "./background-voice.js";
import { PHONE_ACTIONS, phoneActionInfo, phoneActionDraft, reviewPhoneAction } from "./phone-actions.js";
import { beginWakeMode, canStartWakeCapture, emptyWakeMode, isWakeBusy, reduceWakeMode, wakeBridge, wakeBridgeAvailable } from "./wake-phrase.js";
import { MAX_BACKUP_BYTES, nativeBackupAvailable, readBackupFile, saveNativeBackup } from "./backup.js";
import { CURRENT_ANDROID_BUILD, DEFAULT_UPDATE_MANIFEST_URL, checkForUpdate } from "./updater.js";
import {
  clearStore,
  deleteRecord,
  exportArgusData,
  prepareArgusImport,
  replaceArgusData,
  listRecords,
  putRecord,
  STORES
} from "./db.js";

const app = document.querySelector("#app");
const navItems = [
  { id: "dashboard", label: "Dashboard" },
  { id: "command", label: "Command" },
  { id: "routines", label: "Routines" },
  { id: "search", label: "Search" },
  { id: "memory", label: "Memory" },
  { id: "investigations", label: "Investigations" },
  { id: "workbench", label: "Workbench" },
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
  phoneDraft: { kind: "map_search", value: "", id: "" },
  actionDispatching: new Set(),
  reminders: [],
  reminderDraft: {},
  reminderPermission: false,
  notificationSettings: null,
  reminderError: "",
  routineBusy: false,
  evidence: [],
  settings: [],
  events: [],
  memoryQuery: "",
  searchQuery: "",
  workbenchCaseId: "all",
  commandDraft: "",
  speechCapture: emptySpeechCapture(),
  speechInfo: { available: false, microphoneGranted: false },
  speechLanguage: "",
  speechModel: null,
  speechNotice: "",
  speechOutput: emptySpeechOutput(),
  ttsInfo: { available: false, voices: [] },
  ttsNotice: "",
  lastCommand: null,
  commandBusy: false,
  commandAccessInfo: {},
  commandAccessNotice: "",
  wakeMode: emptyWakeMode(),
  wakeInfo: { available: false },
  wakeSensitivity: "sensitive",
  backgroundWake: { enabled: false, running: false, sensitivity: "sensitive", autoRun: true },
  backgroundSeen: "",
  backgroundCapture: null,
  backgroundLastText: "",
  typedDraftDirty: false,
  backupBusy: false,
  backupNotice: "",
  backupPreview: null,
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
  state.reminders = await listRecords("reminders");
  state.evidence = await listRecords("evidence");
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
  if (view === "search") return "";
  if (view === "command") return "";
  if (view === "routines") return state.reminders.filter((item) => item.enabled).length;
  if (view === "memory") return state.memory.length;
  if (view === "investigations") return state.investigations.length;
  if (view === "workbench") return state.evidence.length;
  if (view === "tools") return state.tools.length;
  if (view === "voice") return state.voiceNotes.length;
  if (view === "bridge") return state.actions.filter((action) => !["completed", "handed_off", "cancelled"].includes(action.status)).length;
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
        ["Evidence", stats.evidence],
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

function renderCommandPreview() {
  if (!state.commandDraft.trim()) return "Say or type one instruction. Argus will show what it understands here.";
  const parsed = parseArgusCommand(state.commandDraft);
  if (parsed.intent === "unknown") return escapeHtml(parsed.response);
  const time = parsed.payload.nextRunAt ? ` · ${formatDate(parsed.payload.nextRunAt)} · ${parsed.payload.repeat}` : "";
  return `<strong>Understood: ${escapeHtml(parsed.title)}</strong>${escapeHtml(time)}<br>${escapeHtml(parsed.safety)}. Press Run Command when ready.`;
}

function renderCommand() {
  const canSpeak = hasTtsBridge() && state.ttsInfo.available && !isSpeechBusy(state.speechCapture) && !isOutputBusy(state.speechOutput) && !isWakeBusy(state.wakeMode);
  const last = state.lastCommand;
  return `
    <section class="band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Command Layer</p>
          <h1>Tell Argus what to do</h1>
          <p>Use everyday phrases to save notes, search, start cases or draft reminders. Check the interpretation below. External actions still need approval.</p>
        </div>
        <span class="status ready">local parser</span>
      </div>
      ${renderBackgroundWake()}
      ${renderSpeechCapture()}
      ${renderWakePhrase()}
      <form class="quick-capture" data-form="command">
        <label class="field">
          <span>Command</span>
          <textarea class="textarea" name="command" maxlength="4000" ${isSpeechBusy(state.speechCapture) || isWakeBusy(state.wakeMode) ? "disabled" : ""} placeholder="Try: could you remind me in twenty minutes to take a break">${escapeHtml(
            state.commandDraft
          )}</textarea>
        </label>
        <p class="command-preview" data-command-preview role="status">${renderCommandPreview()}</p>
        <div class="actions">
          <button class="button" type="submit" ${isSpeechBusy(state.speechCapture) || isWakeBusy(state.wakeMode) ? "disabled" : ""}>Run Command</button>
          ${
            last?.response
              ? `<button class="button secondary" type="button" data-action="speak-command" ${
                  canSpeak ? "" : "disabled"
                }>Speak Reply offline</button>`
              : ""
          }
          <button class="button quiet" type="button" data-action="clear-command">Clear</button>
        </div>
      </form>
      ${renderSpeechOutput()}
    </section>
    ${renderCommandAccess()}
    <section class="band">
      <div class="section-head">
        <div>
          <h2>Examples</h2>
          <p>Commands currently use English phrases. You can say “please”, “could you” or “Hey Argus” first. Similar phrasings work; unfamiliar or ambiguous requests need editing. One instruction at a time.</p>
        </div>
      </div>
      <div class="command-examples">
        ${COMMAND_EXAMPLES.map(
          (example) =>
            `<button class="button quiet" type="button" data-action="use-command-example" data-command="${escapeHtml(
              example
            )}">${escapeHtml(example)}</button>`
        ).join("")}
      </div>
    </section>
    ${
      last
        ? `<section class="band">
            <div class="section-head">
              <div>
                <h2>Last result</h2>
                <p>${escapeHtml(last.response)}</p>
              </div>
              <span class="status ${last.intent === "unknown" ? "blocked" : "ready"}">${escapeHtml(last.intent.replaceAll("_", " "))}</span>
            </div>
            <article class="card item-card">
              <header>
                <div>
                  <h3>${escapeHtml(last.title)}</h3>
                  <p>${escapeHtml(last.safety)} · ${escapeHtml(last.confidence)} confidence</p>
                </div>
              </header>
              <p>${escapeHtml(renderPayloadSummary(last.payload))}</p>
              <div class="tag-row">
                <span class="tag">view: ${escapeHtml(last.targetView || "command")}</span>
                <span class="tag">local-first</span>
                <span class="tag">${last.action ? "queued action" : "no external dispatch"}</span>
              </div>
            </article>
          </section>`
        : ""
    }
  `;
}

function hasSpeechBridge() {
  return state.bridgeInfo.capabilities?.includes("offline_speech") && typeof window.ArgusAndroid?.getSpeechState === "function";
}

function refreshBackgroundWake() {
  if (!backgroundVoiceAvailable()) return;
  try { state.backgroundWake = backgroundVoiceBridge("getBackgroundWakeState"); }
  catch (error) { state.speechNotice = error.message; }
}

function renderBackgroundWake() {
  if (!backgroundVoiceAvailable()) return "";
  const info = state.backgroundWake;
  const busy = isSpeechBusy(state.speechCapture) || isWakeBusy(state.wakeMode) || state.recording || state.commandBusy || state.backupBusy;
  const capture = state.backgroundCapture && isSpeechBusy(state.speechCapture);
  return `<div class="speech-panel">
    <div class="section-head"><div><h2>Hey Argus in other apps</h2><p>Keep wake listening enabled after a one-time setup.</p></div>
      <span class="status ${info.running ? "ready" : "stub"}" data-background-phase>${capture ? "command capture" : info.running ? info.phase : "off"}</span></div>
    <p>Enable it here, switch to another app and say <strong>Hey Argus</strong>. A wake alert acknowledges the phrase. Wait for the <strong>short ready beep and two vibrations</strong>, then speak your command. Listening resumes after the command finishes.</p>
    <div class="actions"><button class="button secondary" type="button" data-action="assistant-setup" ${busy ? "disabled" : ""}>${info.assistantActive ? "Digital assistant settings" : "Set Argus as digital assistant"}</button>
      ${!info.notificationGranted ? `<button class="button secondary" type="button" data-action="reminder-permission">Allow notifications</button>` : ""}
      <button class="button quiet" type="button" data-action="background-notification-settings">Wake alert settings</button>
      <button class="button quiet" type="button" data-action="test-wake-ready-cue" ${busy || info.running ? "disabled" : ""}>Test ready sound / vibration</button>
      <button class="button quiet" type="button" data-action="refresh-background-wake">Refresh setup</button></div>
    <p>${info.assistantActive ? info.assistantReady ? "Argus is selected and connected as your digital assistant. It can request Command over another app." : "Argus is selected, but Android has not connected its assistant service yet. Re-select Argus in Digital assistant settings if this persists." : "Select Argus in Android's digital assistant prompt to open Command hands-free. This changes your current default assistant. Without that selection, a detection waits for you to tap the Hey Argus notification."}</p>
    <p class="routine-help">Pause Hey Argus before testing the ready cue. Silent mode, Do Not Disturb, notification volume and wake alert settings can suppress feedback.</p>
    <label class="field"><span>Sensitivity</span><select class="select" data-background-sensitivity ${busy ? "disabled" : ""}>
      <option value="standard" ${info.sensitivity === "standard" ? "selected" : ""}>Standard</option>
      <option value="sensitive" ${info.sensitivity === "sensitive" ? "selected" : ""}>More sensitive</option></select></label>
    <label><input type="checkbox" data-background-auto ${info.autoRun ? "checked" : ""} ${busy ? "disabled" : ""}> Run supported local commands after wake</label>
    <p class="routine-help">This can save notes and sources, start cases, search and navigate Argus. Reminder commands prepare a draft; external actions stay in the approval queue. Turn this off to review all recognised text.</p>
    <div class="actions"><button class="button" type="button" data-action="enable-background-wake" ${busy || !info.microphoneGranted || !info.notificationGranted ? "disabled" : ""}>${info.enabled ? "Apply settings / Retry" : "Enable Hey Argus by default"}</button>
      ${info.enabled || info.running ? `<button class="button quiet" type="button" data-action="pause-background-wake">Pause Hey Argus</button>` : ""}
      ${capture ? `<button class="button quiet" type="button" data-action="cancel-speech">Cancel command recording</button>` : ""}</div>
    <p role="status" data-background-status>${escapeHtml(capture ? state.speechCapture.message : info.message || "Hey Argus is off.")}</p>
    <p data-background-last-wake>Last wake: ${escapeHtml(info.lastWake || "No wake detected in this app session.")}</p>
    ${state.typedDraftDirty || state.speechCapture.phase === "review" ? `<p>Use or clear your current command text before another automatic wake capture.</p>` : ""}
    ${state.backgroundLastText ? `<p>Last heard: ${escapeHtml(state.backgroundLastText)}</p>` : ""}
    <p data-background-meter>${escapeHtml(microphoneLevel(info))}</p>
    <p class="routine-help">Your choice is remembered. An ongoing notification shows when the service is running and offers Pause. Listening pauses when locked or the screen is off. Reopen Argus after a force-stop or reboot if Android has not resumed it. Audio stays on this phone and is not saved.</p>
    <p class="routine-help">More sensitive can also trigger accidentally. The meter helps compare speaking with and without your case; normal volume with missed phrases points to recognition tuning. Longer listening uses battery and still needs testing on your phone.</p>
  </div>`;
}

function configureBackgroundListening(enabled) {
  if (enabled && (isWakeBusy(state.wakeMode) || isSpeechBusy(state.speechCapture) || state.recording)) throw new Error("Finish the current recording first.");
  const sensitivity = app.querySelector("[data-background-sensitivity]")?.value || state.backgroundWake.sensitivity || "sensitive";
  const autoRun = app.querySelector("[data-background-auto]")?.checked ?? state.backgroundWake.autoRun;
  backgroundVoiceBridge("configureBackgroundWake", { enabled, sensitivity, autoRun: Boolean(autoRun) });
  if (!enabled) finishBackgroundCapture();
}

function drainBackgroundWake() {
  const info = state.backgroundWake;
  const focus = document.activeElement;
  const editing = hasUnfinishedWakeInput({ dirty: state.typedDraftDirty,
    focused: Boolean(focus?.matches("input, textarea, select")),
    setupControl: Boolean(focus?.matches("[data-background-sensitivity], [data-background-auto]")),
    emptyCommand: Boolean(focus?.matches('[name="command"]') && !focus.value.trim()) });
  if (!canTakeBackgroundWake(info, { ready: state.dbReady, visible: !document.hidden,
    busy: state.backupBusy || state.commandBusy || state.routineBusy || state.recording || isWakeBusy(state.wakeMode) || isSpeechBusy(state.speechCapture) || state.speechCapture.phase === "review",
    editing, seen: state.backgroundSeen })) return;
  state.backgroundSeen = info.pendingToken;
  stopSpeechOutput();
  state.activeView = "command";
  state.speechCapture = beginSpeechCapture(`speech-${crypto.randomUUID()}`);
  state.backgroundCapture = { token: info.pendingToken, sessionId: state.speechCapture.sessionId, autoRun: info.autoRun === true };
  try { backgroundVoiceBridge("startBackgroundSpeech", { token: info.pendingToken, sessionId: state.speechCapture.sessionId, language: state.speechLanguage }); }
  catch (error) {
    state.speechCapture = reduceSpeechCapture(state.speechCapture, { type: "error", sessionId: state.speechCapture.sessionId, message: error.message });
    finishBackgroundCapture();
  }
  render();
  window.scrollTo(0, 0);
}

function finishBackgroundCapture() {
  const capture = state.backgroundCapture;
  state.backgroundCapture = null;
  if (capture) {
    try { backgroundVoiceBridge("finishBackgroundCommand", { token: capture.token }); }
    catch (error) { state.speechNotice = error.message; }
  }
}

async function runBackgroundResult(capture) {
  if (state.backgroundCapture !== capture) return;
  const text = state.speechCapture.transcript;
  const parsed = parseArgusCommand(text);
  const mode = spokenCommandMode(parsed);
  if (!capture.autoRun || mode === "review" || document.hidden || state.activeView !== "command" || state.commandBusy || state.routineBusy || state.backupBusy || state.typedDraftDirty) {
    finishBackgroundCapture();
    render();
    return;
  }
  state.commandBusy = true;
  try {
    await handleCommandText(text);
    state.backgroundLastText = text;
    if (state.speechCapture.sessionId === capture.sessionId) state.speechCapture = emptySpeechCapture();
    if (hasTtsBridge() && state.ttsInfo.available && !["speak_reply", "stop_speaking"].includes(parsed.intent) && state.lastCommand?.response) {
      try { playOfflineReply(state.lastCommand.response); } catch (error) { state.speechNotice = error.message; }
    }
  } catch (error) { state.speechNotice = error.message; setToast(error.message); }
  finally { state.commandBusy = false; finishBackgroundCapture(); render(); }
}

function refreshWakeInfo() {
  if (!wakeBridgeAvailable()) return;
  try {
    const info = wakeBridge("getWakeState");
    state.wakeInfo = info;
    state.wakeMode = reduceWakeMode(state.wakeMode, info);
  } catch (error) { state.wakeInfo = { available: false, message: error.message }; }
}

function renderWakePhrase() {
  const native = wakeBridgeAvailable();
  const mode = state.wakeMode;
  const busy = isWakeBusy(mode);
  const capturing = mode.phase === "consumed" && isSpeechBusy(state.speechCapture);
  const statusMessage = capturing ? state.speechCapture.message : mode.message || state.wakeInfo.message || "Wake mode is off.";
  const blocked = state.backgroundWake.enabled || !state.wakeInfo.available || !state.speechInfo.available || !state.speechInfo.microphoneGranted ||
    isSpeechBusy(state.speechCapture) || state.speechCapture.phase === "review" || state.recording || state.commandBusy || state.routineBusy;
  return `<div class="speech-panel">
    <div class="section-head"><div><h2>Hey Argus</h2><p>Experimental wake listening while Command is open.</p></div>
      <span class="status ${busy || capturing ? "ready" : "stub"}">${capturing ? "command capture" : busy ? "microphone in use" : "off"}</span></div>
    ${native ? `<p>Start a test, say <strong>Hey Argus</strong>, then pause. After the short vibration and the <strong>Listening</strong> message, say your command.</p>
      <label class="field"><span>Wake sensitivity</span><select class="select" data-wake-sensitivity ${busy ? "disabled" : ""}>
        <option value="standard" ${state.wakeSensitivity === "standard" ? "selected" : ""}>Standard</option>
        <option value="sensitive" ${state.wakeSensitivity === "sensitive" ? "selected" : ""}>More sensitive — may trigger by mistake</option>
      </select></label>
      <div class="actions">${busy ? `<button class="button" type="button" data-action="stop-wake" ${mode.phase === "stopping" ? "disabled" : ""}>${mode.phase === "stopping" ? "Releasing microphone…" : "Stop wake listening"}</button>` :
        `<button class="button secondary" type="button" data-action="start-wake" ${blocked ? "disabled" : ""}>Listen for Hey Argus · 5 min</button>`}</div>
      <p role="status">${escapeHtml(statusMessage)}</p>
      ${busy ? `<p class="routine-help" data-wake-meter>${escapeHtml(microphoneLevel(state.wakeInfo))}</p>` : ""}
      ${capturing ? `<button class="button quiet" type="button" data-action="cancel-speech">Cancel command recording</button>` : ""}
      ${!state.speechInfo.microphoneGranted ? `<p>Allow the microphone in Speak a command first.</p>` : ""}
      ${!state.speechInfo.available ? `<p>Starting a command after the wake phrase needs an available on-device speech service.</p>` : ""}
      ${state.speechCapture.phase === "review" ? `<p>Use or clear the recognised text before starting another wake test.</p>` : ""}
      ${mode.elapsedMs ? `<p>Last test: ${(mode.elapsedMs / 1000).toFixed(1)} seconds elapsed; ${(mode.audioMs / 1000).toFixed(1)} seconds of audio checked.</p>` : ""}
      <p class="routine-help">This keeps the microphone and screen on for up to five minutes. It stops after one detection, when you tap Stop, leave Command, lock the phone or switch apps. Audio is processed on this phone and is not saved. Review the recognised words before running anything.</p>
      <p class="routine-help">Voice and room noise affect detection. Try More sensitive if it misses you; it can also cause accidental captures. Wake listening must be started again for each test.</p>` :
      `<p>Install the Argus v0.13 Android app to try offline wake listening. Tap-to-speak remains available in supported Android builds.</p>`}
  </div>`;
}

function startWakeMode() {
  if (state.backgroundWake.enabled) throw new Error("Pause background Hey Argus before the five-minute test.");
  if (isWakeBusy(state.wakeMode) || isSpeechBusy(state.speechCapture) || state.speechCapture.phase === "review" || state.recording) throw new Error("Finish or clear the current recording first.");
  if (!state.speechInfo.available || !state.speechInfo.microphoneGranted) throw new Error("Set up on-device speech and microphone access first.");
  stopSpeechOutput();
  state.wakeMode = beginWakeMode(`wake-${crypto.randomUUID()}`);
  try { wakeBridge("startWakeListening", { sessionId: state.wakeMode.sessionId, sensitivity: state.wakeSensitivity }); }
  catch (error) { state.wakeMode = { ...state.wakeMode, phase: "error", message: error.message }; }
  render();
}

function stopWakeMode() {
  if (!isWakeBusy(state.wakeMode)) return;
  state.wakeMode = { ...state.wakeMode, phase: "stopping", message: "Stopping wake listening and releasing the microphone…" };
  try { wakeBridge("stopWakeListening", { sessionId: state.wakeMode.sessionId }); }
  catch (error) { state.wakeMode = { ...state.wakeMode, phase: "error", message: error.message }; }
}

function receiveWakeEvent(event) {
  if (!event || typeof event !== "object") return;
  if (event.type === "wake_state") state.wakeInfo = event;
  const previous = state.wakeMode;
  state.wakeMode = reduceWakeMode(previous, event);
  if (state.wakeMode !== previous && state.wakeMode.phase === "detected") {
    if (canStartWakeCapture(state.wakeMode, { ready: state.dbReady, visible: !document.hidden, view: state.activeView,
      busy: state.backupBusy || state.routineBusy || state.commandBusy || state.recording || isSpeechBusy(state.speechCapture) || state.speechCapture.phase === "review",
      speechAvailable: state.speechInfo.available })) {
      const wakeId = state.wakeMode.sessionId;
      state.wakeMode = { ...state.wakeMode, phase: "handoff" };
      try { startSpeechCapture(wakeId); }
      catch (error) { stopWakeMode(); state.speechNotice = error.message; }
    } else stopWakeMode();
  }
  if (state.dbReady && state.activeView === "command") render();
}

function refreshCommandAccessInfo() {
  if (!commandAccessAvailable()) return;
  try { state.commandAccessInfo = commandAccessBridge("getCommandAccessState"); }
  catch (error) { state.commandAccessNotice = error.message; }
}

function renderCommandAccess() {
  const native = commandAccessAvailable();
  const info = state.commandAccessInfo;
  const busy = state.commandBusy || state.routineBusy || isSpeechBusy(state.speechCapture) || isOutputBusy(state.speechOutput) || isWakeBusy(state.wakeMode) || state.recording;
  return `<section class="band">
    <div class="section-head"><div><h2>Open Command faster</h2>
      <p>Open this screen from your home screen or swipe-down panel, then tap Start listening.</p></div></div>
    ${native ? `<div class="actions">
      <button class="button secondary" type="button" data-action="pin-command" ${!info.pinSupported || busy ? "disabled" : ""}>Pin home-screen shortcut</button>
      ${info.tilePromptSupported ? `<button class="button secondary" type="button" data-action="add-command-tile" ${info.tileRequestPending || busy ? "disabled" : ""}>${info.tileRequestPending ? "Waiting for Android…" : "Add Quick Settings tile"}</button>` : ""}
      <button class="button quiet" type="button" data-action="refresh-command-access">Refresh access</button>
    </div>
    <p role="status">${escapeHtml(state.commandAccessNotice || info.message || "Checking shortcut support…")}</p>
    ${info.shortcutPinned ? `<p>Android reports a pinned Command shortcut. Check your current home screen to find it.</p>` : ""}
    ${info.shortcutPublished ? `<p>You can also long-press the Argus app icon and choose <strong>Command</strong> if your launcher supports app shortcuts.</p>` : ""}
    ${!info.pinSupported ? `<p>This launcher does not offer a pin prompt. Try the app icon's long-press menu or the Argus tile.</p>` : ""}
    <p role="status">${escapeHtml(info.tileMessage || "Swipe down twice, tap Edit and drag Argus into your active tiles.")}</p>
    <p class="routine-help">The tile opens Command after you unlock the phone. Neither entry point starts recording or runs a command. Your typed draft stays in place while the app remains running.</p>` :
    `<p>Install the Argus v0.12 Android app to add these shortcuts. You can keep typing commands here.</p>`}
  </section>`;
}

function drainCommandLaunch() {
  try {
    if (!takeCommandLaunch({ ready: state.dbReady, busy: state.backupBusy || state.routineBusy || state.commandBusy, visible: !document.hidden })) return;
    stopWakeMode();
    cancelSpeechCapture();
    stopSpeechOutput();
    state.activeView = "command";
    refreshCommandAccessInfo();
    refreshSpeechInfo();
    refreshTtsInfo();
    render();
    window.scrollTo(0, 0);
  } catch (error) { state.commandAccessNotice = error.message; }
}

function hasTtsBridge() {
  return state.bridgeInfo.capabilities?.includes("offline_tts") && typeof window.ArgusAndroid?.getTtsState === "function";
}

function refreshTtsInfo() {
  if (!hasTtsBridge()) return;
  try { state.ttsInfo = ttsBridge("getTtsState"); }
  catch (error) { state.ttsNotice = error.message; }
}

function renderSpeechOutput() {
  const native = hasTtsBridge();
  const info = state.ttsInfo;
  const busy = isOutputBusy(state.speechOutput);
  const recording = isSpeechBusy(state.speechCapture) || isWakeBusy(state.wakeMode);
  return `<div class="speech-panel">
    <div class="section-head"><div><h2>Spoken replies</h2><p>${native ? escapeHtml(info.message || "Checking installed offline voices…") : "Offline spoken replies need the Argus v0.9 Android app. Replies remain readable on screen."}</p></div></div>
    ${native ? `<label class="field"><span>Installed offline voice</span>
      <select class="select" data-tts-voice ${!info.ready || busy || recording ? "disabled" : ""}>
        <option value="" ${!info.selectedVoice ? "selected" : ""} disabled>Choose an offline voice</option>
        ${(info.voices || []).map((voice) => `<option value="${escapeHtml(voice.id)}" ${voice.id === info.selectedVoice ? "selected" : ""}>${escapeHtml(voice.label)}</option>`).join("")}
      </select></label>
      <div class="actions">
        <button class="button secondary" type="button" data-action="test-tts" ${info.available && !busy && !recording ? "" : "disabled"}>Test voice</button>
        ${busy ? `<button class="button" type="button" data-action="stop-tts">Stop speaking</button>` : ""}
        <button class="button quiet" type="button" data-action="tts-settings" ${recording ? "disabled" : ""}>Android text-to-speech settings</button>
        <button class="button quiet" type="button" data-action="refresh-tts" ${busy || recording ? "disabled" : ""}>Refresh voices</button>
      </div>
      <p role="status">${escapeHtml(state.ttsNotice || state.speechOutput.message || "Speech plays only when you tap Test voice or Speak Reply. Use your phone's media volume to adjust it.")}</p>
      ${info.mediaVolume === 0 ? `<p>Media volume was zero at the last check. Raise it if you cannot hear the voice.</p>` : ""}
      <p class="routine-help">Only voices Android marks as installed and usable without network synthesis are listed. Voice downloads are managed in Android settings and can require internet access.</p>` : ""}
  </div>`;
}

function playOfflineReply(text) {
  if (isWakeBusy(state.wakeMode)) throw new Error("Stop wake listening before playing a reply.");
  if (isSpeechBusy(state.speechCapture) || state.recording) throw new Error("Finish recording before playing a spoken reply.");
  if (!hasTtsBridge() || !state.ttsInfo.available) throw new Error("Choose an installed offline voice in Command before playing a reply.");
  stopSpeechOutput();
  state.ttsNotice = "";
  state.speechOutput = beginSpeechOutput(`tts-${crypto.randomUUID()}`);
  try { ttsBridge("speakOffline", { sessionId: state.speechOutput.sessionId, text }); }
  catch (error) { state.speechOutput = reduceSpeechOutput(state.speechOutput, { type: "error", sessionId: state.speechOutput.sessionId, message: error.message }); }
  render();
}

function stopSpeechOutput() {
  if (!isOutputBusy(state.speechOutput)) return;
  const sessionId = state.speechOutput.sessionId;
  state.speechOutput = reduceSpeechOutput(state.speechOutput, { type: "stopped", sessionId, message: "Spoken reply stopped." });
  try { ttsBridge("stopTts", { sessionId }); }
  catch (error) { state.ttsNotice = error.message; }
}

function receiveTtsEvent(event) {
  if (!event || typeof event !== "object") return;
  if (event.type === "capabilities") state.ttsInfo = event;
  else if (event.type === "notice") state.ttsNotice = event.message || "";
  else state.speechOutput = reduceSpeechOutput(state.speechOutput, event);
  if (state.dbReady && state.activeView === "command") render();
}

function refreshSpeechInfo() {
  if (!hasSpeechBridge()) return;
  try {
    state.speechInfo = speechBridge("getSpeechState");
    if (!state.speechLanguage) state.speechLanguage = getSettingValue("speech-language", "") || state.speechInfo.deviceLanguage || "en-AU";
  } catch (error) { state.speechNotice = error.message; }
}

function renderSpeechCapture() {
  const native = hasSpeechBridge();
  const info = state.speechInfo;
  const capture = state.speechCapture;
  const busy = isSpeechBusy(capture);
  const languages = new Map([[info.deviceLanguage || "en-AU", `Phone language (${info.deviceLanguage || "en-AU"})`], ["en-AU", "English (Australia)"], ["en-US", "English (United States)"], ["en-GB", "English (United Kingdom)"]]);
  if (state.speechLanguage && !languages.has(state.speechLanguage)) languages.set(state.speechLanguage, state.speechLanguage);
  return `<div class="speech-panel">
    <div class="section-head"><div><h2>Speak a command</h2>
      <p>${native ? escapeHtml(info.message || "Checking on-device speech availability…") : "Offline speech input needs the Argus v0.8 Android app. You can type commands below."}</p></div>
      <span class="status ${info.available ? "ready" : "stub"}">${info.available ? "on-device engine" : "typing available"}</span></div>
    ${native ? `<label class="field"><span>Spoken language</span><select class="select" data-speech-language ${busy ? "disabled" : ""}>
      ${[...languages].map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === state.speechLanguage ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}
    </select></label>
    <div class="actions">
      ${busy ? `<button class="button" type="button" data-action="stop-speech" ${capture.phase === "processing" ? "disabled" : ""}>Finish speaking</button>
        <button class="button quiet" type="button" data-action="cancel-speech">Cancel recording</button>` :
        `<button class="button" type="button" data-action="${info.microphoneGranted ? "start-speech" : "speech-permission"}" ${info.available && !isWakeBusy(state.wakeMode) ? "" : "disabled"}>${info.microphoneGranted ? "Start listening" : "Allow microphone"}</button>`}
      <button class="button quiet" type="button" data-action="speech-settings" ${busy ? "disabled" : ""}>Android voice settings</button>
      ${!info.microphoneGranted ? `<button class="button quiet" type="button" data-action="speech-app-settings">Argus app permissions</button>` : ""}
    </div>
    ${info.modelDownloadSupported ? `<details class="speech-language-help"><summary>Check or download an offline language</summary>
      <p>A language download uses internet access. Recognition uses the on-device service.</p>
      <div class="actions"><button class="button secondary" type="button" data-action="check-speech-language" ${busy ? "disabled" : ""}>Check language</button>
      <button class="button quiet" type="button" data-action="download-speech-language" ${busy ? "disabled" : ""}>Request language download</button></div></details>` : ""}
    <p class="speech-status" role="status">${escapeHtml(capture.message || "Tap Start listening, speak, then review the result. Recording ends after a pause or when you tap Finish speaking.")}</p>
    ${capture.partial ? `<p class="speech-partial">Hearing: ${escapeHtml(capture.partial)}</p>` : ""}
    ${state.speechModel ? `<p role="status">${escapeHtml(state.speechModel.message)}</p>` : ""}
    ${state.speechNotice ? `<p role="status">${escapeHtml(state.speechNotice)}</p>` : ""}
    ${capture.phase === "review" ? `<div class="speech-review"><strong>Recognised text</strong><p>${escapeHtml(capture.transcript)}</p>
      <button class="button secondary" type="button" data-action="use-speech-text">Use text in command box</button>
      <p>You can edit it below before tapping Run Command.</p></div>` : ""}
    <p class="routine-help">Tap Start listening, or use the optional Hey Argus test below. Command audio is not saved and recognised text never runs automatically.</p>` : ""}
  </div>`;
}

function startSpeechCapture(wakeId = null) {
  if (!wakeId && isWakeBusy(state.wakeMode)) throw new Error("Stop wake listening and wait for the microphone to be released first.");
  if (isSpeechBusy(state.speechCapture)) return;
  if (state.recording) throw new Error("Stop the voice-note recording before starting a spoken command.");
  state.speechNotice = "";
  stopSpeechOutput();
  state.speechCapture = beginSpeechCapture(`speech-${crypto.randomUUID()}`);
  try {
    const payload = { sessionId: state.speechCapture.sessionId, language: state.speechLanguage };
    if (wakeId) wakeBridge("startSpeechFromWake", { ...payload, wakeId });
    else speechBridge("startSpeech", payload);
  }
  catch (error) { state.speechCapture = reduceSpeechCapture(state.speechCapture, { type: "error", sessionId: state.speechCapture.sessionId, message: error.message }); }
  render();
}

function cancelSpeechCapture() {
  finishBackgroundCapture();
  if (!isSpeechBusy(state.speechCapture)) return;
  const sessionId = state.speechCapture.sessionId;
  state.speechCapture = reduceSpeechCapture(state.speechCapture, { type: "cancelled", sessionId, message: "Recording cancelled. Your typed command is unchanged." });
  try { speechBridge("cancelSpeech", { sessionId }); }
  catch (error) { state.speechNotice = error.message; }
}

function receiveSpeechEvent(event) {
  if (!event || typeof event !== "object") return;
  if (event.type === "capabilities") {
    state.speechInfo = event;
    if (!state.speechLanguage) state.speechLanguage = event.deviceLanguage || "en-AU";
  } else if (event.type === "model") {
    if (event.language === state.speechLanguage) state.speechModel = event;
  } else if (event.type === "notice") state.speechNotice = event.message || "";
  else {
    const previous = state.speechCapture;
    state.speechCapture = reduceSpeechCapture(previous, event);
    const capture = state.backgroundCapture;
    if (capture?.sessionId === event.sessionId && state.speechCapture !== previous && !isSpeechBusy(state.speechCapture)) {
      if (event.type === "result" && state.speechCapture.phase === "review") void runBackgroundResult(capture);
      else finishBackgroundCapture();
    }
  }
  if (state.dbReady && state.activeView === "command") render();
}

function hasReminderBridge() {
  return state.bridgeInfo.capabilities?.includes("local_reminder") && typeof window.ArgusAndroid?.getReminderState === "function";
}

function renderRoutines() {
  const native = hasReminderBridge();
  const draft = state.reminderDraft;
  const sorted = [...state.reminders].sort((a, b) => Number(b.enabled) - Number(a.enabled) || String(a.nextRunAt).localeCompare(String(b.nextRunAt)));
  return `
    <section class="band">
      <div class="section-head"><div><p class="eyebrow">On this phone</p><h1>Reminders and routines</h1>
        <p>Save a reminder, check its time, then enable it. Argus can notify you once, daily or weekly.</p>
        <p>Expand a reminder notification to use Snooze 10 min or Done. Done handles that occurrence; Pause stops future repeats.</p></div></div>
      <div class="routine-notice" role="status">
        <strong>${native ? (state.reminderPermission ? "Notifications are enabled" : "Notifications are off") : "Save here; schedule in the Android app"}</strong>
        <p>${native ? "Android handles delivery while Argus is closed. Battery saving, force-stop or a powered-off phone can delay reminders. These are approximate reminders; use your phone alarm for exact timing." : "The browser can save and edit reminders. Background notifications need the Argus v0.7 Android APK."}</p>
        ${state.reminderError ? `<p>${escapeHtml(state.reminderError)}</p>` : ""}
        ${native ? `<div class="actions">
          ${!state.reminderPermission ? `<button class="button" data-action="reminder-permission">Enable notifications</button>` : ""}
          <button class="button secondary" data-action="reminder-settings">Reminder sound and banner settings</button>
          <button class="button quiet" data-action="test-reminder-alert" ${state.reminderPermission && !state.routineBusy ? "" : "disabled"}>Send test alert now</button>
          <button class="button quiet" data-action="refresh-reminders">Refresh status</button>
        </div>
        <div class="notification-help"><h3>Sound and banner status</h3>
          ${notificationAdvice(state.notificationSettings, state.reminderPermission).map((note) => `<p>${escapeHtml(note)}</p>`).join("")}
          <p>In Android settings, choose <strong>Alert</strong>, select a <strong>Sound</strong> and enable <strong>Show as pop-up</strong> if shown. Return here and send a test alert. Names vary with your Samsung software version.</p>
          <p>Updates preserve your existing notification category settings. Argus cannot force a banner or sound over phone settings.</p>
        </div>` : ""}
      </div>
      <form class="quick-capture" data-form="reminder">
        <h2>${draft.id ? "Edit reminder" : "New reminder"}</h2>
        ${draft.notice ? `<p role="status">${escapeHtml(draft.notice)}</p>` : ""}
        <label class="field"><span>What should Argus remind you about?</span>
          <input class="input" name="title" required maxlength="120" placeholder="Review today's notes" value="${escapeHtml(draft.title || "")}"></label>
        <div class="field-grid">
          <label class="field"><span>First reminder (phone's local time)</span>
            <input class="input" name="due" type="datetime-local" required value="${escapeHtml(draft.due || "")}"></label>
          <label class="field"><span>Repeat</span><select class="select" name="repeat">
            ${[["once", "Once"], ["daily", "Daily"], ["weekly", "Weekly"]].map(([value, label]) => `<option value="${value}" ${(draft.repeat || "once") === value ? "selected" : ""}>${label}</option>`).join("")}
          </select></label>
        </div>
        <label class="field"><span>Optional note</span><textarea class="textarea" name="note" maxlength="500">${escapeHtml(draft.note || "")}</textarea></label>
        <p class="routine-help">Repeats stay in the time zone where you save them. Saving edits pauses the reminder until you enable it again.</p>
        <div class="actions"><button class="button" type="submit">Save reminder</button>
          <button class="button quiet" type="button" data-action="clear-reminder-draft">Clear form</button></div>
      </form>
    </section>
    <div class="list-grid">
      ${sorted.length ? sorted.map((item) => `<article class="card item-card" id="${escapeHtml(item.id)}">
        <header><div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.repeat)} · ${escapeHtml(formatDate(item.nextRunAt))} (phone time)</p></div>
          <span class="status ${item.enabled ? "ready" : "stub"}">${escapeHtml(item.status || "paused")}</span></header>
        ${item.note ? `<p>${escapeHtml(item.note)}</p>` : ""}
        ${item.snoozedUntil ? `<p><strong>Snoozed until ${escapeHtml(formatDate(item.snoozedUntil))}</strong>${item.repeat !== "once" ? `. Next regular reminder: ${escapeHtml(formatDate(item.nextRunAt))}.` : "."}</p>` : ""}
        <p class="routine-help">Repeat time zone: ${escapeHtml(item.timeZone || "UTC")}</p>
        ${item.lastResult ? `<p>${escapeHtml(item.lastResult)}</p>` : ""}
        ${item.lastFiredAt ? `<p>Last notification posted: ${escapeHtml(formatDate(item.lastFiredAt))}</p>` : ""}
        ${item.lastActionAt ? `<p>Last handled: ${escapeHtml(item.lastAction === "snooze" ? "Snoozed" : "Done")} · ${escapeHtml(formatDate(item.lastActionAt))}</p>` : ""}
        <div class="actions">
          ${native && typeof window.ArgusAndroid?.actOnReminderNotification === "function" && canHandleReminderAlert(item) ?
            ["snooze", "done"].map((operation) => `<button class="button secondary" data-action="handle-reminder-alert" data-operation="${operation}" data-id="${escapeHtml(item.id)}" data-revision="${escapeHtml(item.revision)}" data-token="${escapeHtml(item.notificationToken)}">${operation === "snooze" ? "Snooze 10 min" : "Done"}</button>`).join("") : ""}
          ${item.enabled ? `<button class="button secondary" data-action="pause-reminder" data-id="${escapeHtml(item.id)}">Pause</button>` :
            `<button class="button" data-action="enable-reminder" data-id="${escapeHtml(item.id)}" ${native ? "" : "disabled"}>Enable reminder</button>`}
          <button class="button quiet" data-action="edit-reminder" data-id="${escapeHtml(item.id)}">Edit</button>
          <button class="button quiet" data-action="delete-reminder" data-id="${escapeHtml(item.id)}">Delete</button>
        </div>
      </article>`).join("") : `<p class="empty">No reminders yet. Try a reminder to review your notes or export an Argus backup.</p>`}
    </div>`;
}

async function refreshReminders() {
  if (!hasReminderBridge()) return;
  try {
    const result = reminderBridge("getReminderState");
    state.reminderPermission = result.notificationsEnabled === true;
    state.notificationSettings = result.notificationSettings || null;
    const merged = mergeNativeReminders(await listRecords("reminders"), result.reminders || []);
    for (const item of merged) await putRecord("reminders", item);
    state.reminders = merged;
    state.reminderError = "";
  } catch (error) {
    state.reminderError = error.message || "Could not read Android reminder status.";
  }
}

async function handleReminder(form) {
  const input = new FormData(form);
  const old = state.reminders.find((item) => item.id === state.reminderDraft.id);
  const reminder = createReminder({
    id: old?.id, createdAt: old?.createdAt, lastFiredAt: old?.lastFiredAt,
    title: input.get("title"), note: input.get("note"), repeat: input.get("repeat"),
    nextRunAt: input.get("due")
  });
  if (old && hasReminderBridge()) reminderBridge("cancelReminder", { id: old.id, delete: true });
  await putRecord("reminders", reminder);
  state.reminderDraft = {};
  await loadData();
  setToast("Reminder saved. Enable it when you're ready.");
}

async function changeReminder(action, id) {
  const item = state.reminders.find((record) => record.id === id);
  if (!item) return;
  if (action === "edit-reminder") {
    state.reminderDraft = { ...item, due: toLocalDateTime(item.nextRunAt) };
    render();
    app.querySelector('[data-form="reminder"]')?.scrollIntoView({ block: "start" });
    return;
  }
  if (action === "enable-reminder") {
    const validated = createReminder(item);
    const result = reminderBridge("scheduleReminder", validated);
    await putRecord("reminders", { ...validated, ...result.reminder });
  } else if (action === "pause-reminder") {
    const result = reminderBridge("cancelReminder", { id });
    await putRecord("reminders", { ...item, ...result.reminder, enabled: false, status: "paused" });
  } else if (action === "delete-reminder") {
    if (hasReminderBridge()) reminderBridge("cancelReminder", { id, delete: true });
    await deleteRecord("reminders", id);
    if (state.reminderDraft.id === id) state.reminderDraft = {};
  }
  await loadData();
  setToast(action === "enable-reminder" ? "Reminder scheduled on this phone." : action === "pause-reminder" ? "Reminder paused." : "Reminder deleted.");
}

async function routineChange(callback) {
  if (state.routineBusy) return;
  state.routineBusy = true;
  try { await callback(); } finally { state.routineBusy = false; drainCommandLaunch(); }
}

function renderSearch() {
  const query = state.searchQuery.trim();
  const results = query ? searchLocalRecords(state, query) : [];
  return `
    <section class="band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Local Search</p>
          <h1>Find anything Argus knows</h1>
          <p>Search memory, cases, sources, evidence, tools, voice notes and queued actions on this device.</p>
        </div>
      </div>
      <form class="quick-capture" data-form="global-search">
        <label class="field">
          <span>Search Argus</span>
          <input class="input" name="query" value="${escapeHtml(state.searchQuery)}" placeholder="username, domain, case title, note, file name">
        </label>
        <button class="button" type="submit">Search</button>
      </form>
    </section>
    <div class="list-grid">
      ${
        query
          ? results.length
            ? results.map(renderSearchResult).join("")
            : `<p class="empty">No local matches for ${escapeHtml(query)}.</p>`
          : `<p class="empty">Enter a search term to look across Argus local data.</p>`
      }
    </div>
  `;
}

function renderSearchResult(result) {
  return `
    <article class="card item-card">
      <header>
        <div>
          <h3>${escapeHtml(result.title)}</h3>
          <p>${escapeHtml(result.kind)} · ${escapeHtml(formatDate(result.createdAt))}</p>
        </div>
        <span class="status ready">${escapeHtml(result.kind)}</span>
      </header>
      <p>${escapeHtml(result.detail)}</p>
      ${result.meta ? `<div class="tag-row">${String(result.meta).split(/\s+/).filter(Boolean).slice(0, 8).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
    </article>
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
        [item.text, item.type, item.sensitivity, ...(item.tags || [])].join(" ").toLowerCase().includes(query)
      )
    : state.memory;
  const review = reviewMemoryRecords(state.memory);

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
            <span>Type</span>
            <select class="select" name="type">
              ${MEMORY_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Tags</span>
            <input class="input" name="tags" placeholder="project, person, idea">
          </label>
        </div>
        <div class="field-grid">
          <label class="field">
            <span>Priority</span>
            <select class="select" name="priority">
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="low">Low</option>
            </select>
          </label>
          <label class="field">
            <span>Sensitivity</span>
            <select class="select" name="sensitivity">
              ${MEMORY_SENSITIVITY.map((level) => `<option value="${escapeHtml(level)}">${escapeHtml(level)}</option>`).join("")}
            </select>
          </label>
        </div>
        <button class="button" type="submit">Save Memory</button>
      </form>
    </section>
    <section class="stats-grid" aria-label="Argus memory review">
      ${[
        ["Stale", review.stale.length],
        ["Duplicates", review.duplicates.length],
        ["Sensitive", review.sensitive.length]
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
          <p>${escapeHtml(item.type || "note")} · ${escapeHtml(item.priority || "normal")} priority</p>
        </div>
        <button class="button quiet" type="button" data-action="delete-memory" data-id="${escapeHtml(item.id)}">Delete</button>
      </header>
      <p>${escapeHtml(item.text)}</p>
      <div class="tag-row">
        ${(item.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("") || `<span class="tag">untagged</span>`}
        <span class="tag">${escapeHtml(item.sensitivity || "normal")}</span>
      </div>
    </article>
  `;
}

function renderInvestigations() {
  return `
    ${renderOsintLeadBuilder()}
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
        <div class="field-grid">
          <label class="field">
            <span>Target</span>
            <input class="input" name="target" placeholder="username, email, domain, URL or image note">
          </label>
          <label class="field">
            <span>Template</span>
            <select class="select" name="templateId">
              ${INVESTIGATION_TEMPLATES.map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`).join("")}
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

function renderOsintLeadBuilder() {
  return `
    <section class="band">
      <div class="section-head">
        <div>
          <p class="eyebrow">OSINT Start</p>
          <h1>Start a phone-first lead</h1>
          <p>Create a local case with a checklist and manual search links for public sources.</p>
        </div>
      </div>
      <form class="quick-capture" data-form="osint-lead">
        <div class="field-grid">
          <label class="field">
            <span>Target</span>
            <input class="input" name="target" placeholder="@username, person@example.com, example.com, image note">
          </label>
          <label class="field">
            <span>Target type</span>
            <select class="select" name="targetType">
              ${OSINT_TARGET_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}
            </select>
          </label>
        </div>
        <button class="button" type="submit">Create OSINT Case</button>
      </form>
    </section>
  `;
}

function renderInvestigationCard(item) {
  const evidence = evidenceForCase(item.id);
  return `
    <article class="card item-card">
      <header>
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.status)} · ${escapeHtml(item.targetType || "general")} · ${escapeHtml(formatDate(item.createdAt))}</p>
        </div>
        <button class="button quiet" type="button" data-action="delete-investigation" data-id="${escapeHtml(item.id)}">Delete</button>
      </header>
      ${
        item.target
          ? `<div class="tag-row">
              <span class="tag">target: ${escapeHtml(item.target)}</span>
              <span class="tag">${escapeHtml(item.templateId || "blank")}</span>
            </div>`
          : ""
      }
      ${item.summary ? `<p>${escapeHtml(item.summary)}</p>` : ""}
      ${renderChecklist(item.checklist)}
      <div class="actions">
        <button class="button secondary" type="button" data-action="add-osint-links" data-id="${escapeHtml(item.id)}">Add Search Links</button>
      </div>
      <ul class="source-list">
        ${(item.sources || []).map(renderSourceItem).join("") || `<li><p>No sources attached yet.</p></li>`}
      </ul>
      <div class="evidence-list">
        <h4>Evidence</h4>
        ${evidence.length ? evidence.map(renderEvidenceItem).join("") : `<p class="empty">No evidence files or notes attached yet.</p>`}
      </div>
      <form class="quick-capture" data-form="evidence">
        <input type="hidden" name="investigationId" value="${escapeHtml(item.id)}">
        <div class="field-grid">
          <label class="field">
            <span>Evidence file</span>
            <input class="input" type="file" name="evidenceFile" accept="image/*,audio/*,video/*,text/*,application/pdf">
          </label>
          <label class="field">
            <span>Title</span>
            <input class="input" name="title" placeholder="Screenshot, document, note">
          </label>
        </div>
        <label class="field">
          <span>Evidence note</span>
          <input class="input" name="note" placeholder="What this evidence shows">
        </label>
        <div class="field-grid">
          <label class="field">
            <span>Observed time</span>
            <input class="input" type="datetime-local" name="observedAt">
          </label>
          <label class="field">
            <span>Linked source</span>
            <select class="select" name="sourceId">
              <option value="">No linked source</option>
              ${(item.sources || [])
                .map((source) => `<option value="${escapeHtml(source.id)}">${escapeHtml(source.title || source.url)}</option>`)
                .join("")}
            </select>
          </label>
        </div>
        <label class="field">
          <span>Related person, account or detail</span>
          <input class="input" name="relatedEntity" placeholder="Optional entity this evidence mentions">
        </label>
        <label class="field">
          <span>Tags</span>
          <input class="input" name="tags" placeholder="screenshot, original, metadata">
        </label>
        <button class="button secondary" type="submit">Attach Evidence</button>
      </form>
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
        <div class="field-grid">
          <label class="field">
            <span>Source type</span>
            <select class="select" name="type">
              ${SOURCE_TYPES.map((type) => `<option value="${escapeHtml(type)}">${escapeHtml(type)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Reliability</span>
            <select class="select" name="reliability">
              ${SOURCE_RELIABILITY.map((level) => `<option value="${escapeHtml(level)}">${escapeHtml(level)}</option>`).join("")}
            </select>
          </label>
        </div>
        <div class="field-grid">
          <label class="field">
            <span>Relationship</span>
            <select class="select" name="relationship">
              ${SOURCE_RELATIONSHIPS.map(
                (relationship) => `<option value="${escapeHtml(relationship)}">${escapeHtml(relationship)}</option>`
              ).join("")}
            </select>
          </label>
          <label class="field">
            <span>Observed time</span>
            <input class="input" type="datetime-local" name="observedAt">
          </label>
        </div>
        <label class="field">
          <span>Related person, account or detail</span>
          <input class="input" name="relatedEntity" placeholder="Optional entity this source mentions">
        </label>
        <label class="field">
          <span>Note</span>
          <input class="input" name="note" placeholder="Why this source matters">
        </label>
        <button class="button secondary" type="submit">Attach Source</button>
      </form>
    </article>
  `;
}

function evidenceForCase(investigationId) {
  return state.evidence.filter((item) => item.investigationId === investigationId);
}

function renderChecklist(checklist = []) {
  if (!Array.isArray(checklist) || checklist.length === 0) return "";
  return `
    <ol class="checklist">
      ${checklist.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
    </ol>
  `;
}

function renderEvidenceItem(item) {
  const fileUrl = item.blob ? URL.createObjectURL(item.blob) : "";
  const fileLabel = item.fileName || item.title || "evidence";
  const linkedSource = item.sourceId ? sourceLabel(item.sourceId) : "";
  return `
    <article class="evidence-item">
      <div>
        <strong>${escapeHtml(item.title || fileLabel)}</strong>
        <p>${escapeHtml(item.note || item.fileName || "Evidence record")}</p>
        <div class="tag-row">
          <span class="tag">${escapeHtml(item.mimeType || "note")}</span>
          <span class="tag">${escapeHtml(formatFileSize(item.fileSize))}</span>
          <span class="tag">seen: ${escapeHtml(formatDate(item.observedAt || item.createdAt))}</span>
          ${linkedSource ? `<span class="tag">source: ${escapeHtml(linkedSource)}</span>` : ""}
          ${item.relatedEntity ? `<span class="tag">entity: ${escapeHtml(item.relatedEntity)}</span>` : ""}
          ${(item.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
        </div>
      </div>
      <div class="actions">
        ${fileUrl ? `<a class="button secondary" href="${escapeHtml(fileUrl)}" download="${escapeHtml(fileLabel)}">Open</a>` : ""}
        <button class="button quiet" type="button" data-action="delete-evidence" data-id="${escapeHtml(item.id)}">Delete</button>
      </div>
    </article>
  `;
}

function sourceLabel(sourceId) {
  for (const investigation of state.investigations) {
    const source = (investigation.sources || []).find((item) => item.id === sourceId);
    if (source) return source.title || source.url || source.id;
  }
  return sourceId;
}

function formatFileSize(bytes) {
  const size = Number(bytes || 0);
  if (!size) return "note";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function renderSourceItem(source) {
  const href = safeLink(source.url);
  return `
    <li>
      <a href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(source.title || source.url)}</a>
      ${source.note ? `<p>${escapeHtml(source.note)}</p>` : ""}
      <div class="tag-row">
        <span class="tag">${escapeHtml(source.type || "link")}</span>
        <span class="tag">${escapeHtml(source.reliability || "unknown")}</span>
        <span class="tag">${escapeHtml(source.relationship || "reference")}</span>
        <span class="tag">${escapeHtml(formatDate(source.createdAt))}</span>
        ${source.relatedEntity ? `<span class="tag">entity: ${escapeHtml(source.relatedEntity)}</span>` : ""}
        ${(source.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
      </div>
    </li>
  `;
}

function getWorkbenchCaseId() {
  if (state.workbenchCaseId === "all") return "all";
  return state.investigations.some((item) => item.id === state.workbenchCaseId) ? state.workbenchCaseId : "all";
}

function renderWorkbench() {
  const selectedCaseId = getWorkbenchCaseId();
  const reviews = state.investigations
    .map((investigation) => buildCaseReview(investigation, state.evidence))
    .filter((review) => selectedCaseId === "all" || review.investigationId === selectedCaseId);
  const timeline = buildEvidenceTimeline(state, selectedCaseId);
  const graph = buildLinkAnalysis(state, selectedCaseId);

  return `
    <section class="band">
      <div class="section-head">
        <div>
          <p class="eyebrow">OSINT Workbench</p>
          <h1>Review the case file</h1>
          <p>Timeline, source comparison and link analysis are computed locally from saved cases, sources and evidence.</p>
        </div>
      </div>
      <form class="quick-capture" data-form="workbench-filter">
        <div class="field-grid">
          <label class="field">
            <span>Case filter</span>
            <select class="select" name="caseId">
              <option value="all" ${selectedCaseId === "all" ? "selected" : ""}>All cases</option>
              ${state.investigations
                .map(
                  (item) =>
                    `<option value="${escapeHtml(item.id)}" ${selectedCaseId === item.id ? "selected" : ""}>${escapeHtml(
                      item.title
                    )}</option>`
                )
                .join("")}
            </select>
          </label>
          <label class="field">
            <span>Mode</span>
            <input class="input" value="Local review only" disabled>
          </label>
        </div>
        <button class="button secondary" type="submit">Review</button>
      </form>
    </section>
    <section class="stats-grid" aria-label="Workbench graph stats">
      ${[
        ["Cases", graph.summary.cases],
        ["Sources", graph.summary.sources],
        ["Evidence", graph.summary.evidence],
        ["Domains", graph.summary.domains],
        ["Entities", graph.summary.entities],
        ["Links", graph.edges.length]
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
          <h2>Case review</h2>
          <p>Argus flags missing pieces without deciding the truth for you.</p>
        </div>
      </div>
      <div class="list-grid">
        ${reviews.length ? reviews.map(renderCaseReviewCard).join("") : `<p class="empty">Create a case to start review.</p>`}
      </div>
    </section>
    <section class="band">
      <div class="section-head">
        <div>
          <h2>Evidence timeline</h2>
          <p>${timeline.length} local events sorted newest first.</p>
        </div>
      </div>
      <div class="timeline-list">
        ${timeline.length ? timeline.slice(0, 40).map(renderTimelineItem).join("") : `<p class="empty">No timeline items yet.</p>`}
      </div>
    </section>
    <section class="band">
      <div class="section-head">
        <div>
          <h2>Link analysis</h2>
          <p>Local relationship map between cases, targets, sources, domains and evidence.</p>
        </div>
      </div>
      ${renderLinkAnalysis(graph)}
    </section>
  `;
}

function renderCaseReviewCard(review) {
  return `
    <article class="card item-card">
      <header>
        <div>
          <h3>${escapeHtml(review.title)}</h3>
          <p>${escapeHtml(review.status)} · last activity ${escapeHtml(formatDate(review.lastActivity))}</p>
        </div>
        <span class="status ${escapeHtml(review.reviewState)}">${escapeHtml(review.reviewState.replaceAll("_", " "))}</span>
      </header>
      <div class="stats-grid compact">
        ${[
          ["Sources", review.sourceCount],
          ["Strong", review.strongSourceCount],
          ["Unverified", review.unverifiedSourceCount],
          ["Evidence", review.evidenceCount],
          ["Files", review.evidenceWithFiles]
        ]
          .map(
            ([label, value]) => `
              <div class="mini-stat">
                <strong>${value}</strong>
                <span>${label}</span>
              </div>
            `
          )
          .join("")}
      </div>
      <div class="tag-row">
        ${renderCountTags(review.reliabilityCounts, "reliability")}
        ${renderCountTags(review.typeCounts, "type")}
        ${renderCountTags(review.relationshipCounts, "link")}
      </div>
      ${
        review.gaps.length
          ? `<ul class="review-list">${review.gaps.map((gap) => `<li>${escapeHtml(gap)}</li>`).join("")}</ul>`
          : `<p>Case has a target, a working note, evidence and at least one stronger source label.</p>`
      }
    </article>
  `;
}

function renderCountTags(counts, prefix) {
  return Object.entries(counts || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `<span class="tag">${escapeHtml(prefix)}: ${escapeHtml(key)} ${value}</span>`)
    .join("");
}

function renderTimelineItem(item) {
  return `
    <article class="timeline-item">
      <div class="timeline-dot" aria-hidden="true"></div>
      <div>
        <header>
          <strong>${escapeHtml(item.title)}</strong>
          <span>${escapeHtml(formatDate(item.timestamp))}</span>
        </header>
        <p>${escapeHtml(item.detail)}</p>
        <div class="tag-row">
          <span class="tag">${escapeHtml(item.kind)}</span>
          <span class="tag">${escapeHtml(item.caseTitle || "case")}</span>
          <span class="tag">${escapeHtml(item.reliability || "unknown")}</span>
          ${item.relationship ? `<span class="tag">${escapeHtml(item.relationship)}</span>` : ""}
          ${item.relatedEntity ? `<span class="tag">entity: ${escapeHtml(item.relatedEntity)}</span>` : ""}
        </div>
      </div>
    </article>
  `;
}

function renderLinkAnalysis(graph) {
  if (!graph.nodes.length) {
    return `<p class="empty">No links to map yet.</p>`;
  }

  return `
    <div class="link-map">
      <div>
        <h3>Nodes</h3>
        <div class="node-cloud">
          ${graph.nodes
            .slice(0, 60)
            .map(
              (node) => `
                <span class="node-chip ${escapeHtml(node.kind)}">
                  <strong>${escapeHtml(node.label)}</strong>
                  <small>${escapeHtml(node.kind)}</small>
                </span>
              `
            )
            .join("")}
        </div>
      </div>
      <div>
        <h3>Relationships</h3>
        <ul class="edge-list">
          ${graph.edges
            .slice(0, 80)
            .map((edge) => `<li><span>${escapeHtml(edge.label)}</span>${escapeHtml(labelForNode(graph, edge.from))} -> ${escapeHtml(labelForNode(graph, edge.to))}</li>`)
            .join("")}
        </ul>
      </div>
    </div>
  `;
}

function labelForNode(graph, id) {
  return graph.nodes.find((node) => node.id === id)?.label || id;
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

function renderPhoneActionEditor() {
  const draft = state.phoneDraft;
  const info = phoneActionInfo(draft.kind) || PHONE_ACTIONS[0];
  return `<section class="band">
    <div class="section-head"><div><h2>${draft.id ? "Edit phone action" : "Prepare a phone action"}</h2>
      <p>Choose the details here, then review the saved card before opening another app.</p></div></div>
    <form class="quick-capture" data-form="phone-action">
      <label class="field"><span>What would you like to do?</span>
        <select class="select" name="kind" data-phone-kind>${PHONE_ACTIONS.map(item => `<option value="${item.id}" ${info.id === item.id ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></label>
      <label class="field"><span>${escapeHtml(info.label)}</span>
        <textarea class="textarea" name="value" data-phone-value maxlength="${info.limit}" ${info.id === "dial_number" ? 'inputmode="tel"' : ""} required>${escapeHtml(draft.value)}</textarea></label>
      <p>${escapeHtml(info.next)}</p>
      ${info.id === "dial_number" ? `<p>Enter digits, with an optional + country code. Contact lookup and extensions are not available yet.</p>` : ""}
      <div class="actions"><button class="button" type="submit">${draft.id ? "Save changes as draft" : "Save for review"}</button>
        <button class="button quiet" type="button" data-action="clear-phone-draft">Clear editor</button></div>
    </form>
  </section>`;
}

function renderBridge() {
  const bridge = state.bridgeInfo || readNativeBridgeInfo();
  return `
    <section class="band">
      <div class="section-head">
        <div>
          <p class="eyebrow">Android Bridge</p>
          <h1>Action queue</h1>
          <p>Review each action, approve it, then choose when to open the other app.</p>
        </div>
        <span class="status ${bridge.available ? "ready" : "stub"}">${bridge.available ? "attached" : "web core"}</span>
      </div>
      ${renderPhoneActionEditor()}
      <details><summary>Other action drafts</summary>
      <form class="quick-capture" data-form="action">
        <div class="field-grid">
          <label class="field">
            <span>Action title</span>
            <input class="input" name="title" placeholder="Example: Open saved source">
          </label>
          <label class="field">
            <span>Capability</span>
            <select class="select" name="capability">
              ${ANDROID_BRIDGE_CAPABILITIES.filter(capability => !phoneActionInfo(capability.id)).map(
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
      </details>
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
  const phone = reviewPhoneAction(action);
  const busy = state.actionDispatching.has(action.id);
  const editing = state.phoneDraft.id === action.id;
  const terminal = ["completed", "handed_off", "cancelled"].includes(status);
  const canOpen = !phone || state.bridgeInfo.capabilities?.includes(action.capability);
  return `
    <article class="card item-card">
      <header>
        <div>
          <h3>${escapeHtml(action.title)}</h3>
          <p>${escapeHtml(phone?.name || action.capability)} · ${escapeHtml(formatDate(action.createdAt))}</p>
        </div>
        <span class="status ${escapeHtml(status)}">${escapeHtml(status.replaceAll("_", " "))}</span>
      </header>
      ${phone ? phone.valid ? `<p><strong>${escapeHtml(phone.label)}</strong></p><p class="phone-action-value">${escapeHtml(phone.value)}</p><p>${escapeHtml(phone.next)}</p>` : `<p role="alert">${escapeHtml(phone.error)} Edit this draft before approving it.</p>` : `<p>${escapeHtml(renderPayloadSummary(action.payload))}</p>`}
      ${phone && !canOpen ? `<p>Opening this action requires the Argus v0.15 Android app.</p>` : ""}
      ${action.lastResult ? `<p>${escapeHtml(action.lastResult)}</p>` : ""}
      ${editing ? `<p>Finish saving your edits, or clear the editor, before approving or opening this action.</p>` : ""}
      <div class="tag-row">
        <span class="tag">${escapeHtml(action.sensitivity || "normal")}</span>
        <span class="tag">${action.requiresConfirmation ? "confirmation required" : "direct"}</span>
      </div>
      <div class="actions">
        ${
          (status === "draft" || phone && ["blocked", "failed", "waiting_for_bridge"].includes(status))
            ? `<button class="button secondary" type="button" data-action="approve-action" data-id="${escapeHtml(action.id)}" ${busy || editing || phone && !phone.valid ? "disabled" : ""}>${status === "draft" ? "Approve" : "Review and approve again"}</button>`
            : ""
        }
        ${
          status === "approved" || !phone && status === "waiting_for_bridge"
            ? `<button class="button" type="button" data-action="dispatch-action" data-id="${escapeHtml(action.id)}" ${busy || editing || !canOpen || phone && !phone.valid ? "disabled" : ""}>${phone ? phone.id === "map_search" ? "Open Maps" : phone.id === "dial_number" ? "Open dialer" : "Choose app to share" : "Dispatch"}</button>`
            : ""
        }
        ${
          !terminal
            ? `<button class="button quiet" type="button" data-action="complete-action" data-id="${escapeHtml(action.id)}" ${busy ? "disabled" : ""}>${phone ? "Dismiss draft" : "Mark Done"}</button>`
            : ""
        }
        ${phone ? `<button class="button quiet" type="button" data-action="edit-phone-action" data-id="${escapeHtml(action.id)}" ${busy ? "disabled" : ""}>${terminal ? "Create another draft" : "Edit draft"}</button>` : ""}
        <button class="button quiet" type="button" data-action="delete-action" data-id="${escapeHtml(action.id)}" ${busy ? "disabled" : ""}>Delete</button>
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
  const updateManifestUrl = getSettingValue("updateManifestUrl", DEFAULT_UPDATE_MANIFEST_URL);
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
        <button class="button" type="button" data-action="export-data" ${state.backupBusy ? "disabled" : ""}>Save backup${nativeBackupAvailable() ? " to phone" : ""}</button>
        <button class="button quiet" type="button" data-action="wipe-data">Wipe Local Data</button>
      </div>
      <p>Backups include saved records, evidence files and voice-note audio. They are unencrypted JSON files, up to 64 MiB. Choose a private location such as a folder in Downloads.</p>
      <p role="status">${escapeHtml(state.backupNotice || "Save a backup before changing installations. Android confirms success only after writing and checking the file.")}</p>
      <form class="quick-capture" data-form="import-data">
        <label class="field">
          <span>Choose a backup to review</span>
          <input class="input" type="file" name="backup" accept="application/json,.json" ${state.backupBusy ? "disabled" : ""}>
        </label>
        <button class="button secondary" type="submit" ${state.backupBusy ? "disabled" : ""}>Review backup</button>
      </form>
      <div data-backup-preview>${renderBackupPreview()}</div>
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

function parseObservedAt(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const date = new Date(text);
  return Number.isFinite(date.valueOf()) ? date.toISOString() : "";
}

function render() {
  const views = {
    dashboard: renderDashboard,
    command: renderCommand,
    routines: renderRoutines,
    search: renderSearch,
    memory: renderMemory,
    investigations: renderInvestigations,
    workbench: renderWorkbench,
    tools: renderTools,
    voice: renderVoice,
    bridge: renderBridge,
    settings: renderSettings
  };
  app.innerHTML = renderShell((views[state.activeView] || renderDashboard)());
}

async function getOrCreateInboxInvestigation() {
  const existing = state.investigations.find((item) => item.title === "Inbox Sources");
  if (existing) return existing;

  const investigation = createInvestigation({
    title: "Inbox Sources",
    summary: "Shared, captured and command-saved source links."
  });
  await putRecord("investigations", investigation);
  return investigation;
}

async function handleCommand(form) {
  return handleCommandText(new FormData(form).get("command"));
}

async function handleCommandText(input) {
  if (isSpeechBusy(state.speechCapture)) throw new Error("Finish or cancel speech capture before running a command.");
  stopSpeechOutput();
  const commandText = String(input || "").trim();
  state.typedDraftDirty = false;
  state.commandDraft = commandText;
  const parsed = parseArgusCommand(commandText);
  const previousReply = state.lastCommand?.response;
  if (parsed.intent === "speak_reply") {
    if (previousReply) playOfflineReply(previousReply);
    else setToast("Run a command first so there is a reply to read.");
    return;
  }
  state.lastCommand = parsed;

  if (["help", "stop_speaking"].includes(parsed.intent)) { setToast(parsed.response); return; }
  if (parsed.intent === "navigate") {
    if (parsed.targetView === "routines") await routineChange(refreshReminders);
    state.activeView = parsed.targetView;
    setToast(parsed.response);
    return;
  }
  if (parsed.intent === "status") {
    await routineChange(refreshReminders);
    state.lastCommand = { ...parsed, response: localStatusReply(state, parsed.payload.kind) };
    setToast("Local summary ready. Use Speak Reply to hear it.");
    return;
  }

  if (parsed.intent === "memory") {
    await putRecord(
      "memory",
      createMemory({
        text: parsed.payload.text,
        tags: parsed.payload.tags || ["command"],
        source: parsed.payload.source || "command"
      })
    );
    await logEvent("command", "Saved memory from command.");
    await loadData();
    state.activeView = parsed.targetView;
    setToast("Command saved memory.");
    return;
  }

  if (parsed.intent === "investigation") {
    const investigation = createInvestigation(parsed.payload);
    investigation.sources = buildOsintSearchLinks(investigation.target || investigation.title, investigation.targetType).map(
      (source) => createSource({ ...source, tags: [...(source.tags || []), "command"] })
    );
    await putRecord("investigations", investigation);
    await logEvent("command", "Created investigation from command.");
    await loadData();
    state.activeView = parsed.targetView;
    setToast("Command created case.");
    return;
  }

  if (parsed.intent === "source") {
    const investigation = await getOrCreateInboxInvestigation();
    investigation.sources = [
      createSource({
        url: parsed.payload.url,
        title: parsed.payload.url,
        note: parsed.payload.note,
        type: "link",
        reliability: parsed.payload.reliability || "unverified",
        tags: ["command", "inbox"]
      }),
      ...(investigation.sources || [])
    ];
    investigation.updatedAt = new Date().toISOString();
    await putRecord("investigations", investigation);
    await logEvent("command", "Saved source from command.");
    await loadData();
    state.activeView = parsed.targetView;
    setToast("Command saved source.");
    return;
  }

  if (parsed.intent === "search") {
    state.searchQuery = parsed.payload.query || "";
    await logEvent("command", "Ran local search from command.");
    await loadData();
    state.activeView = parsed.targetView;
    setToast("Command searched Argus.");
    return;
  }

  if (parsed.intent === "local_reminder") {
    state.reminderDraft = { title: parsed.payload.text, due: toLocalDateTime(parsed.payload.nextRunAt), repeat: parsed.payload.repeat, notice: parsed.payload.notice };
    state.activeView = "routines";
    setToast(parsed.response);
    return;
  }

  if (parsed.action) {
    await putRecord("actions", createAction(parsed.action));
    await logEvent("command", "Queued action from command.");
    await loadData();
    state.activeView = parsed.targetView;
    setToast("Command queued action.");
    return;
  }

  await logEvent("command", "Command was not recognised.");
  setToast("Command not recognised yet.");
}

function speakCommandResponse() {
  const response = state.lastCommand?.response;
  if (response) playOfflineReply(response);
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
        priority: formData.get("priority"),
        type: formData.get("type"),
        sensitivity: formData.get("sensitivity")
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
      status: formData.get("status"),
      target: formData.get("target"),
      templateId: formData.get("templateId")
    })
  );
  await logEvent("investigation", "Created investigation.");
  await loadData();
  setToast("Case created.");
}

async function handleOsintLead(form) {
  const formData = new FormData(form);
  const target = String(formData.get("target") || "").trim();
  if (!target) return;

  const targetType = detectOsintTargetType(target);
  const requestedType = String(formData.get("targetType") || "auto");
  const type = requestedType === "auto" ? targetType : requestedType;
  const templateId = INVESTIGATION_TEMPLATES.some((template) => template.id === type) ? type : "blank";
  const investigation = createInvestigation({
    title: `OSINT: ${target}`,
    target,
    targetType: type,
    templateId,
    summary: ""
  });

  investigation.sources = buildOsintSearchLinks(target, type).map((source) =>
    createSource({
      ...source,
      tags: source.tags || ["search-link", type]
    })
  );

  await putRecord("investigations", investigation);
  await logEvent("investigation", `Created OSINT lead for ${target}.`);
  await loadData();
  state.activeView = "investigations";
  setToast("OSINT case created locally.");
}

async function handleSource(form) {
  const formData = new FormData(form);
  const investigation = state.investigations.find((item) => item.id === formData.get("investigationId"));
  if (!investigation) return;

  investigation.sources = [
    createSource({
      url: formData.get("url"),
      title: formData.get("title"),
      note: formData.get("note"),
      type: formData.get("type"),
      reliability: formData.get("reliability"),
      relationship: formData.get("relationship"),
      relatedEntity: formData.get("relatedEntity"),
      observedAt: parseObservedAt(formData.get("observedAt")) || undefined
    }),
    ...(investigation.sources || [])
  ];
  investigation.updatedAt = new Date().toISOString();
  await putRecord("investigations", investigation);
  await logEvent("source", `Attached source to ${investigation.title}.`);
  await loadData();
  setToast("Source attached.");
}

async function handleEvidence(form) {
  const formData = new FormData(form);
  const file = form.elements.evidenceFile.files?.[0] || null;
  const evidence = createEvidence({
    investigationId: formData.get("investigationId"),
    title: formData.get("title"),
    note: formData.get("note"),
    fileName: file?.name,
    mimeType: file?.type,
    fileSize: file?.size,
    blob: file,
    sourceId: formData.get("sourceId"),
    relatedEntity: formData.get("relatedEntity"),
    observedAt: parseObservedAt(formData.get("observedAt")) || undefined,
    tags: normalizeTags(formData.get("tags"))
  });

  await putRecord("evidence", evidence);
  await logEvent("evidence", `Attached evidence to ${evidence.investigationId}.`);
  await loadData();
  setToast("Evidence attached locally.");
}

async function addOsintLinks(id) {
  const investigation = state.investigations.find((item) => item.id === id);
  if (!investigation) return;

  const target = investigation.target || investigation.title.replace(/^OSINT:\s*/i, "");
  const sourceLinks = buildOsintSearchLinks(target, investigation.targetType || "auto").map((source) =>
    createSource(source)
  );
  const existingUrls = new Set((investigation.sources || []).map((source) => source.url));
  const newSources = sourceLinks.filter((source) => !existingUrls.has(source.url));
  investigation.sources = [...newSources, ...(investigation.sources || [])];
  investigation.updatedAt = new Date().toISOString();
  await putRecord("investigations", investigation);
  await logEvent("source", `Added ${newSources.length} OSINT search links to ${investigation.title}.`);
  await loadData();
  setToast(newSources.length ? "Search links added." : "Search links already attached.");
}

async function deleteInvestigation(id) {
  await deleteRecord("investigations", id);
  for (const item of state.evidence.filter((evidence) => evidence.investigationId === id)) {
    await deleteRecord("evidence", item.id);
  }
  await loadData();
  setToast("Case and evidence deleted.");
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

async function handlePhoneAction(form) {
  const input = new FormData(form);
  const draft = phoneActionDraft(input.get("kind"), input.get("value"));
  const existing = state.phoneDraft.id && state.actions.find(item => item.id === state.phoneDraft.id);
  if (existing && state.actionDispatching.has(existing.id)) throw new Error("Wait for this action to finish opening.");
  await putRecord("actions", existing ? { ...existing, ...draft, updatedAt: new Date().toISOString(), lastResult: "Changes saved. Review and approve again." } : createAction(draft));
  state.phoneDraft = { kind: draft.capability, value: "", id: "" };
  await logEvent("action", existing ? "Edited phone action; approval cleared." : "Saved a phone action for review.");
  await loadData();
  setToast("Phone action saved for review.");
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

function renderBackupPreview() {
  const preview = state.backupPreview;
  if (!preview) return "";
  const labels = { memory: "Memories", investigations: "Cases", tools: "Tools", voiceNotes: "Voice notes", actions: "Actions", reminders: "Reminders", evidence: "Evidence items", settings: "Settings", events: "History entries" };
  return `<article class="card"><h2>Review before restoring</h2>
    <p>${escapeHtml(preview.name)} · exported ${escapeHtml(formatDate(preview.summary.exportedAt))}</p>
    <p>${Object.entries(preview.summary.counts).map(([key, count]) => `${escapeHtml(labels[key] || key)}: ${count}`).join(" · ")}</p>
    <p>${preview.summary.attachments} attachment(s) decoded successfully. Restoring replaces current records, pauses reminders and requires pending actions to be approved again.</p>
    <div class="actions"><button class="button" data-action="restore-backup" ${state.backupBusy ? "disabled" : ""}>Replace data with this backup</button>
    <button class="button quiet" data-action="discard-backup">Cancel restore</button></div></article>`;
}

async function handleImport(form) {
  const file = form.elements.backup.files?.[0];
  if (!file) return;
  state.backupPreview = null;
  state.backupBusy = true;
  state.backupNotice = "Checking backup records and attachments…";
  try {
    const { payload, summary } = await readBackupFile(file);
    const prepared = await prepareArgusImport(payload);
    state.backupPreview = { prepared, summary, name: file.name };
    state.backupNotice = "Backup checked. Review its contents below before replacing data.";
  } catch (error) { state.backupNotice = error.message; throw error; }
  finally { state.backupBusy = false; render(); }
}

async function restoreBackup() {
  if (state.actionDispatching.size) throw new Error("Wait for the current phone action to finish opening before restoring a backup.");
  const preview = state.backupPreview;
  if (!preview) throw new Error("Choose and review a backup first.");
  if (!window.confirm("Replace this device's Argus data with this backup? Existing reminders will be cancelled and restored reminders will be paused.")) return;
  state.backupBusy = true;
  if (backgroundVoiceAvailable()) configureBackgroundListening(false);
  cancelSpeechCapture();
  stopSpeechOutput();
  try {
    // All records and attachments have been prepared before cancelling any schedule.
    if (hasReminderBridge()) {
      try { reminderBridge("clearReminders"); }
      catch (error) {
        await refreshReminders(); await loadData();
        throw new Error("Restore stopped because Android reminders could not be fully cancelled. Your local records were not replaced. Review Routines, then try again.");
      }
    }
    try { await replaceArgusData(preview.prepared); }
    catch (error) {
      await refreshReminders(); await loadData();
      throw new Error("Restore did not complete. Existing records were kept; Android reminders may now be paused. Review Routines before enabling them again.");
    }
    state.backupPreview = null;
    state.reminderDraft = {};
    state.phoneDraft = { kind: "map_search", value: "", id: "" };
    state.lastCommand = null;
    await logEvent("import", "Restored a reviewed Argus backup.");
    await loadData();
    state.backupNotice = "Backup restored. Reminders are paused; review their times before enabling them. Pending actions need fresh approval.";
    setToast(state.backupNotice);
  } catch (error) { state.backupNotice = error.message; throw error; }
  finally { state.backupBusy = false; render(); }
}

async function handleUpdateSettings(form) {
  const manifestUrl =
    String(new FormData(form).get("manifestUrl") || "").trim() || DEFAULT_UPDATE_MANIFEST_URL;
  await saveSetting("updateManifestUrl", manifestUrl);
  await logEvent("settings", "Saved update manifest URL.");
  await loadData();
  setToast("Update URL saved.");
}

async function checkUpdates() {
  const manifestUrl =
    getSettingValue("updateManifestUrl", DEFAULT_UPDATE_MANIFEST_URL) || DEFAULT_UPDATE_MANIFEST_URL;
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
  if (state.recording) throw new Error("Save your voice-note recording before backing up.");
  state.backupBusy = true;
  state.backupNotice = "Preparing a complete backup…";
  render();
  try {
  await refreshReminders();
  const data = await exportArgusData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  if (blob.size > MAX_BACKUP_BYTES) throw new Error("The backup exceeds 64 MiB. No file was saved.");
  const filename = `argus-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.json`;
  if (nativeBackupAvailable()) {
    const result = await saveNativeBackup(blob, filename, notice => { state.backupNotice = notice; render(); });
    if (result.status === "cancelled") { state.backupNotice = "Backup cancelled. No backup was confirmed saved."; return; }
    state.backupNotice = "Backup saved and checked. Use Review backup to inspect the saved file without replacing your data.";
  } else {
  if (state.bridgeInfo.host === "android") throw new Error("Install Argus v0.11 or later to save backups through Android's file picker.");
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  state.backupNotice = "Download requested. Check your browser's Downloads, then use Review backup to check the saved file.";
  }
  await logEvent("export", nativeBackupAvailable() ? "Saved and verified a backup through Android." : "Requested a browser backup download.");
  await loadData();
  } catch (error) { state.backupNotice = error.message; throw error; }
  finally { state.backupBusy = false; render(); }
}

async function startRecording() {
  try {
    if (isWakeBusy(state.wakeMode)) throw new Error("Wait for wake listening to release the microphone first.");
    refreshBackgroundWake();
    if (state.backgroundWake.enabled || state.backgroundWake.audioBusy) throw new Error("Pause Hey Argus and wait for audio to stop before recording a voice note.");
    stopSpeechOutput();
    cancelSpeechCapture();
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
  if (state.actionDispatching.size) throw new Error("Wait for the current phone action to finish opening before clearing data.");
  const confirmed = window.confirm("Clear all local Argus data on this device?");
  if (!confirmed) return;
  if (backgroundVoiceAvailable()) configureBackgroundListening(false);
  cancelSpeechCapture();
  if (hasReminderBridge()) reminderBridge("clearReminders");
  for (const store of STORES) {
    await clearStore(store);
  }
  await ensureSeedData();
  state.reminderDraft = {};
  state.phoneDraft = { kind: "map_search", value: "", id: "" };
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
  if (state.actionDispatching.has(id)) return;
  if (state.phoneDraft.id === id) throw new Error("Save your changes or clear the editor before opening this action.");
  if (action.capability === "local_reminder") {
    state.reminderDraft = { title: action.payload?.text || action.title };
    state.activeView = "routines";
    setToast("Choose a time to turn this draft into a reminder.");
    return;
  }
  state.actionDispatching.add(id);
  render();
  try {
    const result = await dispatchNativeAction(action);
    await updateAction(
    id,
    {
      status: result.status,
      lastResult: result.message
    },
      result.dispatched ? result.status === "handed_off" ? "Handed to Android. Finish in the other app." : "Action dispatched." : "Action held locally."
    );
  } finally { state.actionDispatching.delete(id); render(); }
}

app.addEventListener("click", async (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    if (viewButton.dataset.view !== "command") { stopWakeMode(); cancelSpeechCapture(); stopSpeechOutput(); }
    state.activeView = viewButton.dataset.view;
    render();
    return;
  }

  const actionButton = event.target.closest("[data-action]");
  if (!actionButton) return;

  const { action, id } = actionButton.dataset;
  try {
  if (state.backupBusy) throw new Error("Finish the current backup operation first.");
  if (id && state.actionDispatching.has(id)) throw new Error("Wait for this action to finish opening.");
  if (action === "assistant-setup") backgroundVoiceBridge("requestAssistantRole");
  if (action === "background-notification-settings") backgroundVoiceBridge("openBackgroundVoiceSettings");
  if (action === "test-wake-ready-cue") backgroundVoiceBridge("testWakeReadyCue");
  if (action === "enable-background-wake") configureBackgroundListening(true);
  if (action === "pause-background-wake") { configureBackgroundListening(false); cancelSpeechCapture(); }
  if (action === "refresh-background-wake") { refreshBackgroundWake(); render(); }
  if (isWakeBusy(state.wakeMode) && !["stop-wake", "clear-command", "cancel-speech", "stop-tts"].includes(action)) throw new Error("Stop wake listening before using another command control.");
  if (action === "start-wake") startWakeMode();
  if (action === "stop-wake") { stopWakeMode(); render(); }
  if (["pin-command", "add-command-tile", "refresh-command-access"].includes(action)) {
    state.commandAccessNotice = "";
    commandAccessBridge({ "pin-command": "pinCommandShortcut", "add-command-tile": "addCommandTile", "refresh-command-access": "refreshCommandAccess" }[action]);
  }
  if (action === "restore-backup") await routineChange(restoreBackup);
  if (action === "discard-backup") { state.backupPreview = null; render(); }
  if (action === "test-tts") playOfflineReply("Argus is ready. This is a test of the selected offline voice.");
  if (action === "stop-tts") { stopSpeechOutput(); render(); }
  if (action === "tts-settings") { stopSpeechOutput(); ttsBridge("openTtsSettings"); }
  if (action === "refresh-tts") { state.ttsNotice = ""; ttsBridge("refreshTtsVoices"); }
  if (action === "start-speech") startSpeechCapture();
  if (action === "stop-speech") {
    const sessionId = state.speechCapture.sessionId;
    state.speechCapture = reduceSpeechCapture(state.speechCapture, { type: "processing", sessionId });
    speechBridge("stopSpeech", { sessionId });
    render();
  }
  if (action === "cancel-speech") { cancelSpeechCapture(); render(); }
  if (action === "speech-permission") speechBridge("requestSpeechPermission");
  if (action === "speech-settings") speechBridge("openSpeechSettings");
  if (action === "speech-app-settings") speechBridge("openSpeechSettings", { permissions: true });
  if (action === "check-speech-language" || action === "download-speech-language") {
    speechBridge(action === "check-speech-language" ? "checkSpeechLanguage" : "downloadSpeechLanguage", { language: state.speechLanguage });
  }
  if (action === "use-speech-text" && state.speechCapture.phase === "review") {
    state.commandDraft = state.speechCapture.transcript;
    state.typedDraftDirty = true;
    state.speechCapture = emptySpeechCapture();
    setToast("Text added. Review or edit it, then tap Run Command.");
  }
  if (["enable-reminder", "pause-reminder", "edit-reminder", "delete-reminder"].includes(action)) {
    await routineChange(() => changeReminder(action, id));
  }
  if (action === "handle-reminder-alert") {
    // Use the authority from the button that was tapped, never a newer alert obtained during refresh.
    const payload = { id, revision: actionButton.dataset.revision, notificationToken: actionButton.dataset.token, action: actionButton.dataset.operation };
    await routineChange(async () => {
      const result = reminderBridge("actOnReminderNotification", payload);
      await refreshReminders();
      setToast(result.message);
    });
  }
  if (action === "clear-reminder-draft") { state.reminderDraft = {}; render(); }
  if (action === "reminder-permission") reminderBridge("requestReminderPermission");
  if (action === "reminder-settings") reminderBridge("openNotificationSettings");
  if (action === "test-reminder-alert") {
    await routineChange(async () => {
      const result = reminderBridge("testReminderNotification");
      await refreshReminders();
      setToast(result.message);
    });
  }
  if (action === "refresh-reminders") { await routineChange(refreshReminders); render(); }
  if (action === "clear-shared-draft") {
    state.sharedDraft = null;
    render();
  }
  if (action === "clear-command") {
    stopWakeMode();
    cancelSpeechCapture();
    stopSpeechOutput();
    state.speechCapture = emptySpeechCapture();
    state.speechNotice = "";
    state.commandDraft = "";
    state.typedDraftDirty = false;
    state.lastCommand = null;
    render();
  }
  if (action === "speak-command") {
    speakCommandResponse();
  }
  if (action === "use-command-example") {
    cancelSpeechCapture();
    state.commandDraft = actionButton.dataset.command || "";
    state.typedDraftDirty = true;
    state.activeView = "command";
    render();
  }
  if (action === "delete-memory") {
    await deleteRecord("memory", id);
    await loadData();
    setToast("Memory deleted.");
  }
  if (action === "delete-investigation") {
    await deleteInvestigation(id);
  }
  if (action === "add-osint-links") {
    await addOsintLinks(id);
  }
  if (action === "delete-evidence") {
    await deleteRecord("evidence", id);
    await loadData();
    setToast("Evidence deleted.");
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
    if (state.phoneDraft.id === id) throw new Error("Save your changes or clear the editor before approving this action.");
    const review = reviewPhoneAction(state.actions.find(item => item.id === id));
    if (review && !review.valid) throw new Error(review.error);
    await updateAction(id, { status: "approved" }, "Action approved.");
  }
  if (action === "clear-phone-draft") { state.phoneDraft = { kind: "map_search", value: "", id: "" }; render(); }
  if (action === "edit-phone-action") {
    const item = state.actions.find(record => record.id === id);
    const info = phoneActionInfo(item?.capability);
    if (info && !state.actionDispatching.has(id)) {
      state.phoneDraft = { kind: info.id, value: typeof item.payload?.[info.field] === "string" ? item.payload[info.field] : "", id: ["completed", "handed_off", "cancelled"].includes(item.status) ? "" : id };
      render(); app.querySelector('[data-form="phone-action"]')?.scrollIntoView({ block: "start" });
    }
  }
  if (action === "complete-action") {
    const phone = phoneActionInfo(state.actions.find(item => item.id === id)?.capability);
    if (state.phoneDraft.id === id) state.phoneDraft = { kind: "map_search", value: "", id: "" };
    await updateAction(id, { status: phone ? "cancelled" : "completed" }, phone ? "Draft dismissed." : "Action marked done.");
  }
  if (action === "dispatch-action") {
    await dispatchAction(id);
  }
  if (action === "delete-action") {
    await deleteRecord("actions", id);
    if (state.phoneDraft.id === id) state.phoneDraft = { kind: "map_search", value: "", id: "" };
    await loadData();
    setToast("Action deleted.");
  }
  if (action === "export-data") {
    await routineChange(exportData);
  }
  if (action === "wipe-data") {
    await routineChange(wipeData);
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

app.addEventListener("input", (event) => {
  if (event.target.matches("[data-phone-value]")) state.phoneDraft.value = event.target.value;
  const form = event.target.closest('[data-form="reminder"]');
  if (form && event.target.name) state.reminderDraft[event.target.name] = event.target.value;
  if (event.target.closest('[data-form="command"]') && event.target.name === "command") {
    state.commandDraft = event.target.value;
    state.typedDraftDirty = true;
    const preview = app.querySelector("[data-command-preview]");
    if (preview) preview.innerHTML = renderCommandPreview();
  }
});

app.addEventListener("change", async (event) => {
  if (event.target.matches("[data-phone-kind]")) {
    state.phoneDraft = { ...state.phoneDraft, kind: event.target.value, value: "" };
    render(); return;
  }
  if (event.target.matches("[data-wake-sensitivity]")) {
    if (["standard", "sensitive"].includes(event.target.value)) state.wakeSensitivity = event.target.value;
    return;
  }
  if (event.target.name === "backup") {
    state.backupPreview = null;
    const preview = app.querySelector("[data-backup-preview]");
    if (preview) preview.innerHTML = "";
    return;
  }
  if (event.target.matches("[data-tts-voice]")) {
    try { state.ttsNotice = ""; ttsBridge("selectTtsVoice", { voiceId: event.target.value }); }
    catch (error) { state.ttsNotice = error.message; render(); }
    return;
  }
  if (!event.target.matches("[data-speech-language]")) return;
  state.speechLanguage = event.target.value;
  state.speechModel = null;
  try { await saveSetting("speech-language", state.speechLanguage); }
  catch (error) { state.speechNotice = error.message; }
});

app.addEventListener("submit", async (event) => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();

  try {
    if (state.backupBusy) throw new Error("Finish the current backup operation first.");
    if (isWakeBusy(state.wakeMode)) throw new Error("Stop wake listening before saving or running a command.");
    const formType = form.dataset.form;
    if (formType === "reminder") await routineChange(() => handleReminder(form));
    if (formType === "quick-capture") await handleQuickCapture(form);
    if (formType === "command") {
      if (state.commandBusy) return;
      state.commandBusy = true;
      try { await handleCommand(form); } finally { state.commandBusy = false; drainCommandLaunch(); }
    }
    if (formType === "global-search") {
      state.searchQuery = new FormData(form).get("query") || "";
      render();
    }
    if (formType === "memory") await handleMemory(form);
    if (formType === "memory-search") {
      state.memoryQuery = new FormData(form).get("query") || "";
      render();
    }
    if (formType === "investigation") await handleInvestigation(form);
    if (formType === "osint-lead") await handleOsintLead(form);
    if (formType === "workbench-filter") {
      state.workbenchCaseId = new FormData(form).get("caseId") || "all";
      render();
    }
    if (formType === "source") await handleSource(form);
    if (formType === "evidence") await handleEvidence(form);
    if (formType === "tool") await handleTool(form);
    if (formType === "action") await handleAction(form);
    if (formType === "phone-action") await handlePhoneAction(form);
    if (formType === "update-settings") await handleUpdateSettings(form);
    if (formType === "import-data") await routineChange(() => handleImport(form));
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
      stopWakeMode();
      cancelSpeechCapture();
      stopSpeechOutput();
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
    await refreshReminders();
    state.speechLanguage = getSettingValue("speech-language", "") || state.speechLanguage;
    refreshSpeechInfo();
    refreshTtsInfo();
    refreshCommandAccessInfo();
    refreshWakeInfo();
    await handleSharedLaunch();
    state.dbReady = true;
    refreshBackgroundWake();
    render();
    drainBackgroundWake();
    drainCommandLaunch();
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

window.ArgusOpenReminder = () => {
  stopWakeMode();
  cancelSpeechCapture();
  stopSpeechOutput();
  state.activeView = "routines";
  if (state.dbReady) render();
  return true;
};
window.addEventListener("argus-native-resume", async () => {
  refreshSpeechInfo();
  refreshTtsInfo();
  refreshCommandAccessInfo();
  refreshWakeInfo();
  refreshBackgroundWake();
  drainCommandLaunch();
  drainBackgroundWake();
  if (state.speechModel?.state === "checking") state.speechModel = { state: "unknown", message: "The language check was interrupted. Tap Check language again." };
  if (!state.dbReady || state.routineBusy || state.backgroundCapture) return;
  await routineChange(refreshReminders);
  if (["routines", "command"].includes(state.activeView)) render();
});

window.ArgusSpeechInbox = { receive: receiveSpeechEvent };
window.ArgusTtsInbox = { receive: receiveTtsEvent };
window.ArgusWakeInbox = { receive: receiveWakeEvent };
window.ArgusBackgroundWakeInbox = { receive(info) {
  if (!info || typeof info !== "object" || Array.isArray(info)) return;
  const old = state.backgroundWake;
  state.backgroundWake = info;
  if (old.enabled && !info.enabled) cancelSpeechCapture();
  drainBackgroundWake();
  const meter = app.querySelector("[data-background-meter]");
  if (meter) meter.textContent = microphoneLevel(info);
  const lastWake = app.querySelector("[data-background-last-wake]");
  if (lastWake) lastWake.textContent = `Last wake: ${info.lastWake || "No wake detected in this app session."}`;
  const status = app.querySelector("[data-background-status]");
  if (status && !state.backgroundCapture) status.textContent = info.message || "Hey Argus is off.";
  const phase = app.querySelector("[data-background-phase]");
  if (phase && !state.backgroundCapture) phase.textContent = info.running ? info.phase : "off";
  if (state.dbReady && state.activeView === "command" && !document.activeElement?.matches("input, textarea, select") &&
    ["enabled", "running", "assistantActive", "assistantReady", "autoRun", "sensitivity", "notificationGranted", "microphoneGranted"].some(key => old[key] !== info[key])) render();
} };
window.ArgusCommandAccessInbox = { receive(info) {
  if (!info || typeof info !== "object" || Array.isArray(info)) return;
  state.commandAccessInfo = info;
  if (state.dbReady && state.activeView === "command") render();
} };
document.addEventListener("visibilitychange", () => {
  if (document.hidden) { stopWakeMode(); cancelSpeechCapture(); stopSpeechOutput(); }
  else { drainCommandLaunch(); refreshBackgroundWake(); drainBackgroundWake(); }
});

init();
