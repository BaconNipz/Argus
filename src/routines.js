export const REMINDER_REPEATS = ["once", "daily", "weekly"];

export function createReminder(input, now = Date.now()) {
  const title = String(input.title || "").trim();
  const note = String(input.note || "").trim();
  const due = new Date(input.nextRunAt).valueOf();
  const repeat = input.repeat || "once";
  if (!title || title.length > 120) throw new Error("Enter a reminder title of 1–120 characters.");
  if (note.length > 500) throw new Error("Keep the reminder note under 500 characters.");
  if (!Number.isFinite(due) || due <= now) throw new Error("Choose a future date and time.");
  if (!REMINDER_REPEATS.includes(repeat)) throw new Error("Choose once, daily or weekly.");
  const timeZone = input.timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  try { new Intl.DateTimeFormat("en", { timeZone }).format(); }
  catch { throw new Error("Choose a valid time zone."); }
  return {
    id: input.id || `rem-${crypto.randomUUID()}`,
    title, note, repeat, timeZone,
    nextRunAt: new Date(due).toISOString(),
    enabled: false,
    status: "paused",
    createdAt: input.createdAt || new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
    lastFiredAt: input.lastFiredAt || "",
    lastResult: "Saved on this device. Enable it to schedule a notification."
  };
}

// Import is data restoration, never permission to replay background actions.
export function restoreReminders(records) {
  if (!Array.isArray(records)) return [];
  return records.filter((item) => item && typeof item.id === "string" && item.id.startsWith("rem-")).map((item) => ({
    id: item.id,
    title: String(item.title || "Reminder").slice(0, 120),
    note: String(item.note || "").slice(0, 500),
    repeat: REMINDER_REPEATS.includes(item.repeat) ? item.repeat : "once",
    timeZone: String(item.timeZone || "UTC"),
    nextRunAt: Number.isFinite(Date.parse(item.nextRunAt)) ? new Date(item.nextRunAt).toISOString() : "",
    createdAt: item.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    enabled: false,
    status: "paused",
    lastFiredAt: item.lastFiredAt || "",
    lastResult: "Restored from backup. Review the time, then enable this reminder."
  }));
}

export function mergeNativeReminders(local, native) {
  const records = new Map(local.map((item) => [item.id, { ...item }]));
  for (const item of records.values()) {
    if (!native.some((other) => other.id === item.id)) {
      if (item.enabled) {
        item.enabled = false;
        item.status = "paused";
        item.lastResult = "No Android schedule found. Review the time and enable again.";
      }
      item.notificationToken = "";
      item.snoozeToken = "";
      item.snoozedUntil = "";
    }
  }
  for (const item of native) records.set(item.id, { ...records.get(item.id), ...item,
    notificationToken: item.notificationToken || "", snoozeToken: item.snoozeToken || "", snoozedUntil: item.snoozedUntil || "" });
  return [...records.values()];
}

export function canHandleReminderAlert(item) {
  return Boolean(item?.revision && item?.notificationToken && ["notified", "scheduled"].includes(item.status) &&
    (item.repeat === "once" || item.enabled));
}

export function toLocalDateTime(iso) {
  const date = new Date(iso);
  if (!Number.isFinite(date.valueOf())) return "";
  return new Date(date.valueOf() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
