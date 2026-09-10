export function notificationAdvice(settings, enabled) {
  if (!enabled) return ["Notifications are blocked. Enable Argus notifications and check the Argus reminders category."];
  if (!settings) return ["Update the Android app to check sound and banner settings here."];
  const notes = [];
  if (settings.importance < 4) notes.push("Banner priority is off for this reminder category. Open Reminder sound and banner settings, select Alert and enable Show as pop-up where available.");
  if (!settings.soundConfigured) notes.push("The reminder category has no notification sound selected. Choose a sound in its Android settings.");
  if (settings.ringerMode !== "normal") notes.push(`The phone is in ${settings.ringerMode === "vibrate" ? "vibrate" : "silent"} mode. Switch the phone to Sound mode to hear reminder tones.`);
  if (settings.notificationVolume === 0) notes.push("Notification volume is zero. Raise notification volume in the phone's sound settings.");
  if (settings.doNotDisturb) notes.push("Do Not Disturb is active and may suppress sound or banners. Review your phone's Do Not Disturb settings.");
  if (!notes.length) notes.push("Sound and banner priority are configured. If no pop-up appears, check Samsung's Show as pop-up and app notification pop-up settings.");
  return notes;
}
