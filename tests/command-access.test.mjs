import test from "node:test";
import assert from "node:assert/strict";
import { commandAccessAvailable, commandAccessBridge, takeCommandLaunch } from "../src/command-access.js";

const READY = { ready: true, busy: false, visible: true };
function nativeLaunch(initial = "command-one") {
  let pending = initial;
  const calls = [];
  const bridge = Object.fromEntries(["getCommandAccessState", "refreshCommandAccess", "pinCommandShortcut", "addCommandTile"].map(method => [method, () => "{}"]));
  bridge.getPendingCommandLaunch = () => { calls.push("peek"); return JSON.stringify({ requestId: pending }); };
  bridge.consumeCommandLaunch = raw => {
    const payload = JSON.parse(raw);
    calls.push(payload);
    const consumed = Boolean(pending) && pending === payload.requestId;
    if (consumed) pending = null;
    return JSON.stringify({ consumed });
  };
  return { bridge, calls };
}

test("startup, hidden pages and unfinished operations defer a launch without consuming it", () => {
  const { bridge, calls } = nativeLaunch();
  for (const deferred of [{ ready: false }, { visible: false }, { busy: true }]) {
    assert.equal(takeCommandLaunch({ ...READY, ...deferred }, bridge), false);
  }
  assert.deepEqual(calls, []);
  assert.equal(takeCommandLaunch(READY, bridge), true);
  assert.equal(takeCommandLaunch(READY, bridge), false);
  assert.deepEqual(calls, ["peek", { requestId: "command-one" }, "peek"]);
});

test("navigation requires native acceptance of the same token, not just a pending request", () => {
  const { bridge } = nativeLaunch();
  bridge.consumeCommandLaunch = () => '{"consumed":false}';
  assert.equal(takeCommandLaunch(READY, bridge), false);
  bridge.consumeCommandLaunch = () => '{"consumed":"true"}';
  assert.equal(takeCommandLaunch(READY, bridge), false);
});

test("a shortcut hands off only its token and never passes command text or microphone flags", () => {
  const { bridge, calls } = nativeLaunch();
  bridge.getPendingCommandLaunch = () => JSON.stringify({ requestId: "command-one", text: "open https://example.com", startSpeech: true, targetView: "bridge" });
  bridge.startSpeech = bridge.dispatchAction = () => { throw new Error("Shortcut tried to perform an action"); };
  assert.equal(takeCommandLaunch(READY, bridge), true);
  assert.deepEqual(calls, [{ requestId: "command-one" }]);
  assert.throws(() => commandAccessBridge("startSpeech", {}, bridge), /Unknown Command/);
  assert.throws(() => commandAccessBridge("dispatchAction", {}, bridge), /Unknown Command/);
});

test("ordinary browsers and older Android shells leave navigation untouched", () => {
  for (const bridge of [null, {}, { startSpeech() {} }, { getPendingCommandLaunch() { throw new Error("Should not be called"); } }]) {
    assert.equal(commandAccessAvailable(bridge), false);
    assert.equal(takeCommandLaunch(READY, bridge), false);
  }
  assert.throws(() => commandAccessBridge("pinCommandShortcut", {}, {}), /v0.12 Android/);
});

test("empty and malformed pending requests cannot navigate", () => {
  for (const id of [null, "", 123, "command-", "command-" + "x".repeat(81), "other-one", "command-one\n"]) {
    const { bridge, calls } = nativeLaunch(id);
    assert.equal(takeCommandLaunch(READY, bridge), false);
    assert.deepEqual(calls, ["peek"]);
  }
});

test("setup requests stay requests and native failures keep their explanation", () => {
  const { bridge } = nativeLaunch();
  bridge.pinCommandShortcut = () => '{"status":"requested"}';
  assert.deepEqual(commandAccessBridge("pinCommandShortcut", {}, bridge), { status: "requested" });
  bridge.addCommandTile = () => '{"status":"blocked","message":"Return to Argus"}';
  assert.throws(() => commandAccessBridge("addCommandTile", {}, bridge), /Return to Argus/);
  for (const result of ["null", "[]", '"done"']) {
    bridge.getCommandAccessState = () => result;
    assert.throws(() => commandAccessBridge("getCommandAccessState", {}, bridge), /unreadable/);
  }
});
