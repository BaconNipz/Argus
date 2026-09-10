// English phrase rules only. Parsing never saves data or dispatches an action.
export function normalizeCommandPhrase(input) {
  let text = String(input || "").trim().replace(/[’‘]/g, "'").replace(/\s+/g, " ");
  for (let pass = 0; pass < 4; pass += 1) {
    text = text.replace(/^(?:(?:hey|okay|ok)\s+)?argus\b[,:!]?\s*/i, "")
      .replace(/^(?:please\s+|(?:can|could|would|will)\s+you\s+(?:please\s+)?|i(?:'d| would)\s+like\s+(?:you\s+)?to\s+)/i, "");
  }
  return text.trim();
}

export function spokenNumber(input) {
  const text = input.toLowerCase().trim().replace(/-/g, " ");
  if (/^\d{1,4}$/.test(text)) return Number(text);
  if (["a", "an"].includes(text)) return 1;
  const small = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  if (small.includes(text)) return small.indexOf(text);
  const tens = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const parts = text.split(" ");
  const ten = tens.indexOf(parts[0]);
  if (ten >= 0 && (parts.length === 1 || (parts.length === 2 && small.indexOf(parts[1]) > 0 && small.indexOf(parts[1]) < 10))) {
    return (ten + 2) * 10 + (parts.length === 2 ? small.indexOf(parts[1]) : 0);
  }
  return NaN;
}

function clockTime(input) {
  const text = input.toLowerCase().replace(/a\.?\s*m\.?$/, "am").replace(/p\.?\s*m\.?$/, "pm").replace(/o'clock/g, "").trim();
  if (text === "noon" || text === "midday") return [12, 0];
  if (text === "midnight") return [0, 0];
  const match = text.match(/^(.+?)\s*(am|pm)$/);
  if (match) {
    const parts = match[1].trim().split(/[: ]+/);
    const hour = spokenNumber(parts.shift());
    const minute = parts.length ? spokenNumber(parts.join(" ")) : 0;
    if (hour >= 1 && hour <= 12 && minute >= 0 && minute < 60) return [hour % 12 + (match[2] === "pm" ? 12 : 0), minute];
  }
  const clock = text.match(/^(\d{1,2}):(\d{2})$/);
  if (clock && +clock[1] < 24 && +clock[2] < 60) return [+clock[1], +clock[2]];
  return null;
}

export function parseReminderTime(input, now = new Date()) {
  const text = input.toLowerCase().trim().replace(/[.!?]+$/, "");
  const reference = new Date(now);
  const missing = { due: "", repeat: "once", notice: "Choose the date and time. For a clock time, say AM or PM, or use 24-hour time such as 14:30." };
  if (!Number.isFinite(reference.valueOf())) return missing;
  const relative = text === "in half an hour" ? null : text.match(/^in\s+(.+?)\s+(minutes?|mins?|hours?|hrs?|days?|weeks?)$/);
  if (relative || text === "in half an hour") {
    const count = relative ? spokenNumber(relative[1]) : 30;
    const unit = relative?.[2] || "minutes";
    if (!(count > 0)) return missing;
    const due = new Date(reference);
    if (/^(day|week)/.test(unit)) {
      const days = count * (unit.startsWith("week") ? 7 : 1);
      if (days > 365) return missing;
      due.setDate(due.getDate() + days);
      if (due.getHours() !== reference.getHours()) return missing;
    } else {
      const milliseconds = count * (/^(hour|hr)/.test(unit) ? 3600000 : 60000);
      if (milliseconds > 365 * 86400000) return missing;
      due.setTime(due.valueOf() + milliseconds);
    }
    return { due: due.toISOString(), repeat: "once", notice: "Review the interpreted time before saving and enabling." };
  }
  const calendar = text.match(/^(today|tomorrow|every day|daily|every (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday))\s+at\s+(.+)$/);
  if (!calendar) return missing;
  const clock = clockTime(calendar[2]);
  if (!clock) return missing;
  const due = new Date(reference);
  const period = calendar[1];
  let repeat = "once";
  if (period === "tomorrow") due.setDate(due.getDate() + 1);
  else if (period === "every day" || period === "daily") repeat = "daily";
  else if (period.startsWith("every ")) {
    repeat = "weekly";
    const day = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].indexOf(period.slice(6));
    due.setDate(due.getDate() + (day - due.getDay() + 7) % 7);
  }
  due.setHours(clock[0], clock[1], 0, 0);
  if (repeat !== "once" && due <= reference) {
    due.setDate(due.getDate() + (repeat === "daily" ? 1 : 7));
    due.setHours(clock[0], clock[1], 0, 0);
  }
  if (due.getHours() !== clock[0] || due.getMinutes() !== clock[1]) {
    return { ...missing, notice: "That clock time does not exist on this date because the clock changes. Choose another time." };
  }
  if (due <= reference) return { ...missing, notice: "That time has already passed. Choose a future date and time." };
  return { due: due.toISOString(), repeat, notice: "Review the interpreted date, local time and repeat before saving and enabling." };
}

export function reminderCommandDraft(input, now = new Date()) {
  const text = input.trim().replace(/[.!?]+$/, "").replace(/^for\s+(?=today|tomorrow|every|daily|in\s)/i, "");
  const beginning = text.match(/^((?:in |today |tomorrow |every |daily ).+?)\s+to\s+(.+)$/i);
  const ending = text.match(/^(?:to\s+)?(.+?)\s+((?:in |today |tomorrow |every |daily ).+)$/i);
  const time = beginning?.[1] || ending?.[2] || "";
  const task = beginning?.[2] || ending?.[1] || text.replace(/^to\s+/i, "");
  const parsed = parseReminderTime(time, now);
  // Never hide unsupported wording in a date guess. Keep the original draft for editing.
  return { text: parsed.due ? task : text.replace(/^to\s+/i, ""), ...(parsed.due ? { nextRunAt: parsed.due } : {}), repeat: parsed.repeat, notice: parsed.notice };
}

export function localStatusReply(records, kind = "overview", now = new Date()) {
  const reminders = records.reminders || [];
  if (kind === "today") {
    const today = new Date(now).toDateString();
    const due = reminders.filter(item => item.enabled && [item.snoozedUntil, item.nextRunAt].some(time => time && new Date(time).toDateString() === today));
    return due.length ? `${due.length} enabled reminder${due.length === 1 ? " is" : "s are"} scheduled for today: ${due.slice(0, 5).map(item => item.title).join("; ")}.${due.length > 5 ? " Open Routines for the full list." : ""}` : "No enabled reminders are scheduled for today. Open Routines to review paused reminders or active alerts.";
  }
  return `You have ${(records.memory || []).length} memories, ${(records.investigations || []).length} cases, ${(records.evidence || []).length} evidence items, and ${reminders.filter(item => item.enabled).length} enabled reminders on this device.`;
}
