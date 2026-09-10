import test from "node:test";
import assert from "node:assert/strict";
import { notificationAdvice } from "../src/notification-status.js";

const alerts = { importance: 4, soundConfigured: true, ringerMode: "normal", notificationVolume: 5, doNotDisturb: false };

test("blocked notifications do not claim that sound and banner settings are ready", () => {
  assert.deepEqual(notificationAdvice(alerts, false), ["Notifications are blocked. Enable Argus notifications and check the Argus reminders category."]);
  assert.match(notificationAdvice(null, true)[0], /Update the Android app/);
});

test("legacy default importance directs the user to pop-up settings even when sound is configured", () => {
  const notes = notificationAdvice({ ...alerts, importance: 3 }, true);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /Banner priority is off/);
  assert.match(notes[0], /Show as pop-up/);
});

test("silent channel, phone modes, volume and DND are reported independently", () => {
  const notes = notificationAdvice({ ...alerts, soundConfigured: false, ringerMode: "vibrate", notificationVolume: 0, doNotDisturb: true }, true);
  assert.equal(notes.length, 4);
  assert.match(notes.join(" "), /no notification sound/);
  assert.match(notes.join(" "), /vibrate mode/);
  assert.match(notes.join(" "), /volume is zero/);
  assert.match(notes.join(" "), /Do Not Disturb/);
});

test("high importance does not promise a Samsung banner was displayed", () => {
  const notes = notificationAdvice(alerts, true);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /If no pop-up appears/);
});
