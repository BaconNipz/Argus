import test from "node:test";
import assert from "node:assert/strict";
import { canHandleReminderAlert, createReminder, mergeNativeReminders, restoreReminders } from "../src/routines.js";
import { normalizeImportPayload, parseArgusCommand } from "../src/argus-core.js";
import { dispatchNativeAction, reminderBridge } from "../src/android-bridge.js";

const now = Date.parse("2026-09-09T00:00:00Z");
const example = { title: "Review notes", nextRunAt: "2026-09-10T09:00:00Z", repeat: "daily", timeZone: "Australia/Adelaide" };

test("saving a valid reminder does not schedule it", () => {
  const reminder = createReminder(example, now);
  assert.equal(reminder.enabled, false);
  assert.equal(reminder.status, "paused");
  assert.equal(reminder.timeZone, "Australia/Adelaide");
  assert.equal(reminder.nextRunAt, "2026-09-10T09:00:00.000Z");
});

test("rejects past or invalid dates, unbounded text, and unsupported schedules", () => {
  for (const patch of [{ nextRunAt: "bad" }, { nextRunAt: new Date(now).toISOString() }, { title: " " }, { title: "x".repeat(121) }, { note: "x".repeat(501) }, { repeat: "hourly" }, { timeZone: "bad/timezone" }]) {
    assert.throws(() => createReminder({ ...example, ...patch }, now));
  }
});

test("imports restore reminder data paused and remove scheduler authority", () => {
  const record = { ...createReminder(example, now), enabled: true, status: "snoozed", revision: "native-revision", notificationToken: "active-alert", snoozeToken: "active-snooze", snoozedUntil: "2026-09-10T09:10:00Z" };
  const restored = normalizeImportPayload({ memory: [], reminders: [record, null, { id: 8 }] }).reminders;
  assert.equal(restored.length, 1);
  assert.equal(restored[0].enabled, false);
  assert.equal(restored[0].status, "paused");
  assert.equal(restored[0].revision, undefined);
  assert.equal(restored[0].notificationToken, undefined);
  assert.equal(restored[0].snoozeToken, undefined);
  assert.equal(restored[0].snoozedUntil, undefined);
  assert.equal(restored[0].title, example.title);
  assert.deepEqual(restoreReminders("not an array"), []);
  assert.deepEqual(normalizeImportPayload({ schema: 3, memory: [] }).reminders, []);
});

test("native completion and snooze state replace the local notification action controls", () => {
  const item = { ...createReminder(example, now), enabled: true, status: "scheduled", revision: "r1", notificationToken: "alert1" };
  const [snoozed] = mergeNativeReminders([item], [{ ...item, status: "snoozed", notificationToken: "", snoozeToken: "s1", snoozedUntil: "2026-09-10T09:10:00Z" }]);
  assert.equal(snoozed.snoozedUntil, "2026-09-10T09:10:00Z");
  assert.equal(snoozed.nextRunAt, item.nextRunAt);
  assert.equal(canHandleReminderAlert(snoozed), false);
  const [done] = mergeNativeReminders([snoozed], [{ ...item, notificationToken: "", lastAction: "done" }]);
  assert.equal(done.snoozedUntil, "");
  assert.equal(done.snoozeToken, "");
  assert.equal(done.notificationToken, "");
  assert.equal(canHandleReminderAlert(done), false);
});

test("missing native records cannot leave usable alert tokens in local storage", () => {
  const item = { ...createReminder(example, now), status: "notified", notificationToken: "old-alert", snoozeToken: "old-snooze", snoozedUntil: "2026-09-10T09:10:00Z" };
  const [missing] = mergeNativeReminders([item], []);
  assert.equal(missing.notificationToken, "");
  assert.equal(missing.snoozedUntil, "");
  assert.equal(canHandleReminderAlert(missing), false);
});

test("delivered one-offs expose actions without claiming a future schedule exists", () => {
  const once = { ...createReminder({ ...example, repeat: "once" }, now), status: "notified", revision: "r", notificationToken: "n" };
  assert.equal(once.enabled, false);
  assert.equal(canHandleReminderAlert(once), true);
  assert.equal(canHandleReminderAlert({ ...once, status: "paused" }), false);
  assert.equal(canHandleReminderAlert({ ...once, repeat: "daily", status: "scheduled" }), false);
  assert.equal(canHandleReminderAlert({ ...once, repeat: "daily", status: "scheduled", enabled: true }), true);
});

test("Android delivery status replaces stale web state, and missing jobs lose scheduled status", () => {
  const first = { ...createReminder(example, now), enabled: true, status: "scheduled" };
  const second = { ...createReminder(example, now), enabled: true, status: "scheduled" };
  const merged = mergeNativeReminders([first, second], [{ ...first, enabled: false, status: "completed", lastFiredAt: "2026-09-10T09:03:00Z" }]);
  assert.equal(merged.find((x) => x.id === first.id).status, "completed");
  assert.equal(merged.find((x) => x.id === second.id).enabled, false);
  assert.equal(merged.find((x) => x.id === second.id).status, "paused");
});

test("reminder commands request a time without inventing or enabling a schedule", () => {
  const command = parseArgusCommand("remind me to export a backup");
  assert.equal(command.targetView, "routines");
  assert.equal(command.payload.text, "export a backup");
  assert.equal(command.payload.nextRunAt, undefined);
  assert.equal(command.action, null);
  assert.equal(parseArgusCommand("open https://example.com").targetView, "bridge");
});

test("unapproved actions never reach Android and native reminder failures are surfaced", async () => {
  let calls = 0;
  globalThis.window = { ArgusAndroid: {
    dispatchAction: () => { calls++; return '{"status":"completed"}'; },
    scheduleReminder: () => '{"status":"blocked","message":"Enable notifications"}'
  } };
  try {
    assert.equal((await dispatchNativeAction({ status: "draft" })).dispatched, false);
    assert.equal(calls, 0);
    assert.equal((await dispatchNativeAction({ status: "approved" })).dispatched, true);
    assert.equal(calls, 1);
    assert.throws(() => reminderBridge("scheduleReminder", {}), /Enable notifications/);
    delete window.ArgusAndroid;
    assert.throws(() => reminderBridge("scheduleReminder", {}), /Android APK/);
  } finally { delete globalThis.window; }
});
