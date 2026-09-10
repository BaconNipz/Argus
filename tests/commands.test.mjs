import test from "node:test";
import assert from "node:assert/strict";
import { COMMAND_EXAMPLES, parseArgusCommand } from "../src/argus-core.js";
import { localStatusReply, normalizeCommandPhrase, parseReminderTime } from "../src/command-language.js";

process.env.TZ = "Australia/Adelaide";
const now = new Date("2026-09-10T09:00:00+09:30");

test("polite phrases and optional spoken name preserve the actual note", () => {
  for (const phrase of ["Hey Argus, could you please remember that", "Please make a note that", "Argus note down that", "I'd like you to remember that", "Keep a note of"]) {
    const result = parseArgusCommand(`${phrase} Casey's domain is example.com`);
    assert.equal(result.intent, "memory", phrase);
    assert.equal(result.payload.text, "Casey's domain is example.com");
  }
  assert.equal(normalizeCommandPhrase("Argusson remember that"), "Argusson remember that");
});

test("natural requests route navigation, search, cases and source capture", () => {
  for (const [phrase, intent, value] of [
    ["Could you show me my reminders?", "navigate", "routines"],
    ["Take me to my cases", "navigate", "investigations"],
    ["Back up my data", "navigate", "settings"],
    ["Restore a backup", "navigate", "settings"],
    ["Find my notes about example.com", "search", "search"],
    ["What do you remember about Casey?", "search", "search"],
    ["Begin an investigation into @casey", "investigation", "investigations"],
    ["Save this link https://example.com", "source", "investigations"]
  ]) {
    const result = parseArgusCommand(phrase);
    assert.equal(result.intent, intent, phrase);
    assert.equal(result.targetView, value, phrase);
    assert.equal(result.action, null);
  }
  assert.equal(parseArgusCommand("Find my notes about example.com").payload.query, "example.com");
  assert.equal(parseArgusCommand("Begin an investigation into @casey").payload.target, "@casey");
});

test("relative spoken and numeric times produce reviewed drafts, not scheduled actions", () => {
  for (const phrase of ["Hey Argus remind me in twenty minutes to take a break", "Set a reminder to take a break in 20 minutes"]) {
    const result = parseArgusCommand(phrase, now);
    assert.equal(result.payload.text, "take a break");
    assert.equal(Date.parse(result.payload.nextRunAt) - now.valueOf(), 20 * 60000);
    assert.equal(result.payload.repeat, "once");
    assert.equal(result.payload.enabled, undefined);
    assert.equal(result.action, null);
  }
  assert.equal(Date.parse(parseReminderTime("in half an hour", now).due) - now.valueOf(), 1800000);
});

test("clock times and weekly/daily repeats use the phone's calendar", () => {
  const tomorrow = parseArgusCommand("Set a reminder for tomorrow at nine thirty am to call mum", now).payload;
  assert.equal(tomorrow.text, "call mum");
  assert.equal(tomorrow.nextRunAt, "2026-09-11T00:00:00.000Z");
  const daily = parseArgusCommand("Remind me to review notes every day at nine am", now).payload;
  assert.equal(daily.nextRunAt, "2026-09-10T23:30:00.000Z");
  assert.equal(daily.repeat, "daily");
  const weekly = parseReminderTime("every monday at 14:30", now);
  assert.equal(weekly.due, "2026-09-14T05:00:00.000Z");
  assert.equal(weekly.repeat, "weekly");
  assert.equal(parseReminderTime("tomorrow at midnight", now).due, "2026-09-10T14:30:00.000Z");
});

test("ambiguous, invalid and past times remain unscheduled for manual correction", () => {
  for (const phrase of ["tomorrow at 7", "today at eight am", "in zero minutes", "in -1 hours", "in two hours and five minutes", "tomorrow at 25:00", "next Thursday evening", "every weekday at nine am"]) {
    assert.equal(parseReminderTime(phrase, now).due, "", phrase);
    const draft = parseArgusCommand(`Remind me to review notes ${phrase}`, now);
    assert.equal(draft.payload.nextRunAt, undefined, phrase);
    assert.match(draft.payload.text, /review notes/);
  }
});

test("nonexistent daylight-saving time is not silently shifted", () => {
  const beforeChange = new Date("2026-10-03T09:00:00+09:30");
  assert.equal(parseReminderTime("tomorrow at 2:30 am", beforeChange).due, "");
  assert.match(parseReminderTime("tomorrow at 2:30 am", beforeChange).notice, /clock changes/);
  assert.equal(parseReminderTime("tomorrow at nine am", beforeChange).due, "2026-10-03T22:30:00.000Z");
});

test("negated, conditional, chained and unsupported actions do not execute", () => {
  for (const phrase of ["Please don't open https://example.com", "If I say yes open https://example.com", "Open https://example.com and then delete my notes", "Send a message to Casey", "Delete all my memories", "remind me", `remember ${"x".repeat(4000)}`]) {
    const result = parseArgusCommand(phrase, now);
    assert.equal(result.intent, "unknown", phrase.slice(0, 80));
    assert.equal(result.action, null);
  }
  const url = parseArgusCommand("Could you take me to https://example.com?");
  assert.equal(url.action.capability, "open_url");
  assert.equal(url.safety, "queued for confirmation");
  assert.equal(parseArgusCommand("Don't forget to save a backup").intent, "local_reminder");
});

test("all examples are recognised and spoken reply controls are explicit", () => {
  for (const phrase of COMMAND_EXAMPLES) assert.notEqual(parseArgusCommand(phrase, now).intent, "unknown", phrase);
  assert.equal(parseArgusCommand("Say that again").intent, "speak_reply");
  assert.equal(parseArgusCommand("Stop speaking").intent, "stop_speaking");
  assert.equal(parseArgusCommand("What can you do?").intent, "help");
});

test("local summaries count records and exclude paused reminders from today's schedule", () => {
  const records = { memory: [{}, {}], investigations: [{}], reminders: [
    { title: "Tea", enabled: true, nextRunAt: "2026-09-10T12:00:00+09:30", snoozedUntil: "2026-09-10T09:10:00+09:30" },
    { title: "Paused", enabled: false, nextRunAt: "2026-09-10T12:00:00+09:30" }
  ] };
  assert.match(localStatusReply(records), /2 memories, 1 cases, 0 evidence items, and 1 enabled reminders/);
  assert.match(localStatusReply(records, "today", now), /^1 enabled reminder is scheduled for today: Tea\./);
  assert.doesNotMatch(localStatusReply(records, "today", now), /Paused/);
});
