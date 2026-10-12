import assert from "node:assert/strict";
import test from "node:test";
import { isPrivateChatType } from "./privacy.js";

test("consumption and history commands are restricted to private chats", () => {
  assert.equal(isPrivateChatType("private"), true);
  assert.equal(isPrivateChatType("group"), false);
  assert.equal(isPrivateChatType("supergroup"), false);
  assert.equal(isPrivateChatType("channel"), false);
  assert.equal(isPrivateChatType(undefined), false);
});
