import assert from "node:assert/strict";
import test from "node:test";
import type { ConsumptionCommandContext } from "./consumption.js";
import { recordFromCommand } from "./consumption.js";
import type { HistoryCommandContext, HistoryDataSource } from "./history.js";
import { showHistory } from "./history.js";

function makeHistoryDataSource(
  overrides: Partial<HistoryDataSource> = {},
): HistoryDataSource {
  return {
    findHistory: async () => [],
    getDailyTotals: async () => ({ cafeina: 0, agua: 0, nicotina: 0 }),
    ...overrides,
  };
}

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
  const dataSource = makeHistoryDataSource({
    findHistory: async () => {
      queried = true;
      return [];
    },
    getDailyTotals: async () => {
      queried = true;
      return { cafeina: 0, agua: 0, nicotina: 0 };
    },
  });
  await showHistory(context, dataSource);

  assert.equal(queried, false);
  assert.match(replies[0] ?? "", /conversa privada/);
});

test("private history is queried for the requesting Telegram user only", async () => {
  const { context, replies } = makeHistoryContext();
  let requestedUserId: string | undefined;
  const dataSource = makeHistoryDataSource({
    findHistory: async (telegramUserId) => {
      requestedUserId = telegramUserId;
      return [];
    },
    getDailyTotals: async (telegramUserId) => {
      assert.equal(telegramUserId, "123456");
      return { cafeina: 80, agua: 250, nicotina: 1 };
    },
  });
  await showHistory(context, dataSource);

  assert.equal(requestedUserId, "123456");
  assert.match(replies[0] ?? "", /Cafeína: 80 mg/);
  assert.match(replies[0] ?? "", /Água: 250 ml/);
  assert.match(replies[0] ?? "", /Nicotina: 1 unidades/);
  assert.match(replies[0] ?? "", /Ainda nao ha registros/);
});

test("history lookup errors return a generic message without exposing details", async (t) => {
  const { context, replies } = makeHistoryContext();
  t.mock.method(console, "error", () => {});
  const dataSource = makeHistoryDataSource({
    getDailyTotals: async () => {
      throw new Error("sensitive database path");
    },
  });
  await showHistory(context, dataSource);

  assert.match(replies[0] ?? "", /Nao consegui consultar seu historico/);
  assert.doesNotMatch(replies[0] ?? "", /sensitive database path/);
});

test("missing Telegram identity data is rejected before history lookup", async () => {
  const noChat = makeHistoryContext({ chat: undefined });
  const noUser = makeHistoryContext({ from: undefined });
  let queried = false;
  const dataSource = makeHistoryDataSource({
    findHistory: async () => {
      queried = true;
      return [];
    },
    getDailyTotals: async () => {
      queried = true;
      return { cafeina: 0, agua: 0, nicotina: 0 };
    },
  });
  await assert.rejects(
    showHistory(noChat.context, dataSource),
    /Telegram chat is missing/,
  );

  await assert.rejects(
    showHistory(noUser.context, dataSource),
    /Telegram user ID is missing/,
  );
  assert.equal(queried, false);
  assert.deepEqual(noChat.replies, []);
  assert.deepEqual(noUser.replies, []);
});
