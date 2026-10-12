import assert from "node:assert/strict";
import test from "node:test";
import type { ConsumptionCommandContext } from "./consumption.js";
import { recordFromCommand } from "./consumption.js";
import type { HistoryCommandContext } from "./history.js";
import { showHistory } from "./history.js";

function makeConsumptionContext(
  overrides: Partial<ConsumptionCommandContext> = {},
  chatType = "private",
): { context: ConsumptionCommandContext; replies: string[] } {
  const messages: string[] = [];
  return {
    context: {
      chat: { type: chatType },
      from: { id: 123456 },
      match: "250",
      reply: async (message) => {
        messages.push(message);
      },
      ...overrides,
    },
    replies: messages,
  };
}

function makeHistoryContext(
  overrides: Partial<HistoryCommandContext> = {},
  chatType = "private",
): { context: HistoryCommandContext; replies: string[] } {
  const messages: string[] = [];
  return {
    context: {
      chat: { type: chatType },
      from: { id: 123456 },
      reply: async (message) => {
        messages.push(message);
      },
      ...overrides,
    },
    replies: messages,
  };
}

test("consumption from a group is rejected before persistence", async () => {
  const { context, replies } = makeConsumptionContext({ match: "" }, "group");
  let saved = false;
  await recordFromCommand(
    context,
    "agua",
    async () => {
      saved = true;
    },
  );

  assert.equal(saved, false);
  assert.match(replies[0] ?? "", /conversa privada/);
});

test("invalid consumption is rejected before persistence", async () => {
  const { context, replies } = makeConsumptionContext({
    match: "1; DROP TABLE consumption_logs;",
  });
  let saved = false;
  await recordFromCommand(context, "agua", async () => {
    saved = true;
  });

  assert.equal(saved, false);
  assert.match(replies[0] ?? "", /quantidade inteira maior que zero/);
});

test("private consumption persists only the sender ID and acknowledges after save", async () => {
  const { context, replies } = makeConsumptionContext();
  let savedEntry: unknown;
  let saveCompleted = false;
  await recordFromCommand(context, "agua", async (entry) => {
    savedEntry = entry;
    await Promise.resolve();
    saveCompleted = true;
  });

  assert.deepEqual(savedEntry, {
    telegramUserId: "123456",
    type: "agua",
    amount: 250,
    unit: "ml",
  });
  assert.equal(saveCompleted, true);
  assert.match(replies[0] ?? "", /Registrado: 250 ml/);
});

test("storage errors return a generic message without exposing error details", async (t) => {
  const { context, replies } = makeConsumptionContext();
  t.mock.method(console, "error", () => {});
  await recordFromCommand(context, "agua", async () => {
    throw new Error("sensitive database path");
  });

  assert.match(replies[0] ?? "", /Nao consegui salvar/);
  assert.doesNotMatch(replies[0] ?? "", /sensitive database path/);
});

test("missing Telegram identity data is rejected before persistence", async () => {
  const noChat = makeConsumptionContext({ chat: undefined });
  await assert.rejects(
    recordFromCommand(noChat.context, "agua", async () => {}),
    /Telegram chat is missing/,
  );

  const noUser = makeConsumptionContext({ from: undefined });
  await assert.rejects(
    recordFromCommand(noUser.context, "agua", async () => {}),
    /Telegram user ID is missing/,
  );
  assert.deepEqual(noChat.replies, []);
  assert.deepEqual(noUser.replies, []);
});

test("history from a group is rejected before looking up records", async () => {
  const { context, replies } = makeHistoryContext({}, "supergroup");
  let queried = false;
  await showHistory(context, async () => {
    queried = true;
    return [];
  });

  assert.equal(queried, false);
  assert.match(replies[0] ?? "", /conversa privada/);
});

test("private history is queried for the requesting Telegram user only", async () => {
  const { context, replies } = makeHistoryContext();
  let requestedUserId: string | undefined;
  await showHistory(context, async (telegramUserId) => {
    requestedUserId = telegramUserId;
    return [];
  });

  assert.equal(requestedUserId, "123456");
  assert.match(replies[0] ?? "", /Ainda nao ha registros/);
});

test("history lookup errors return a generic message without exposing details", async (t) => {
  const { context, replies } = makeHistoryContext();
  t.mock.method(console, "error", () => {});
  await showHistory(context, async () => {
    throw new Error("sensitive database path");
  });

  assert.match(replies[0] ?? "", /Nao consegui consultar seu historico/);
  assert.doesNotMatch(replies[0] ?? "", /sensitive database path/);
});

test("missing Telegram identity data is rejected before history lookup", async () => {
  const noChat = makeHistoryContext({ chat: undefined });
  await assert.rejects(
    showHistory(noChat.context, async () => []),
    /Telegram chat is missing/,
  );

  const noUser = makeHistoryContext({ from: undefined });
  await assert.rejects(
    showHistory(noUser.context, async () => []),
    /Telegram user ID is missing/,
  );
  assert.deepEqual(noChat.replies, []);
  assert.deepEqual(noUser.replies, []);
});
