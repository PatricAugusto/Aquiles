import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import {
  formatHistory,
  getDailyConsumptionTotals,
  getLocalDayBounds,
  getRecentConsumptionLogs,
  HISTORY_LIMIT,
} from "./history.js";

test("history is private to its user, newest first, and limited to ten records", async () => {
  const databaseFile = `history-${randomUUID()}.db`;
  const databaseUrl = `file:./${databaseFile}`;
  const databasePath = resolve("prisma", databaseFile);
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  const prismaCli = resolve("node_modules", "prisma", "build", "index.js");
  const prisma = new PrismaClient({ datasourceUrl: databaseUrl });

  try {
    const migration = spawnSync(
      process.execPath,
      [prismaCli, "migrate", "deploy"],
      { cwd: process.cwd(), env, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(migration.status, 0, migration.stderr);

    const userId = `history-test-${randomUUID()}' OR 1=1 --`;
    const otherUserId = `other-user-${randomUUID()}`;
    const totalsUserId = `daily-totals-${randomUUID()}`;
    const now = new Date("2026-01-01T02:30:00.000Z");
    await prisma.consumptionLog.createMany({
      data: [
        ...Array.from({ length: HISTORY_LIMIT + 2 }, (_, index) => ({
          telegramUserId: userId,
          type: "agua",
          amount: index + 1,
          unit: "ml",
          consumedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
        })),
        {
          telegramUserId: otherUserId,
          type: "nicotina",
          amount: 99,
          unit: "unidades",
          consumedAt: new Date(Date.UTC(2026, 0, 2)),
        },
        {
          telegramUserId: totalsUserId,
          type: "cafeina",
          amount: 999,
          unit: "mg",
          consumedAt: new Date("2025-12-31T02:59:00.000Z"),
        },
        {
          telegramUserId: totalsUserId,
          type: "cafeina",
          amount: 80,
          unit: "mg",
          consumedAt: new Date("2025-12-31T03:00:00.000Z"),
        },
        {
          telegramUserId: totalsUserId,
          type: "cafeina",
          amount: 40,
          unit: "mg",
          consumedAt: now,
        },
        {
          telegramUserId: totalsUserId,
          type: "agua",
          amount: 500,
          unit: "ml",
          consumedAt: now,
        },
        {
          telegramUserId: totalsUserId,
          type: "agua",
          amount: 999,
          unit: "ml",
          consumedAt: new Date("2026-01-01T03:00:00.000Z"),
        },
        {
          telegramUserId: otherUserId,
          type: "nicotina",
          amount: 7,
          unit: "unidades",
          consumedAt: now,
        },
      ],
    });

    const history = await getRecentConsumptionLogs(prisma, userId);

    assert.equal(history.length, HISTORY_LIMIT);
    assert.equal(history[0]?.amount, HISTORY_LIMIT + 2);
    assert.equal(history.at(-1)?.amount, 3);
    assert.ok(history.every((entry) => entry.telegramUserId === userId));

    const totals = await getDailyConsumptionTotals(prisma, totalsUserId, now);
    assert.deepEqual(totals, { cafeina: 120, agua: 500, nicotina: 0 });
  } finally {
    await prisma.$disconnect();
    await Promise.all(
      ["", "-journal", "-shm", "-wal"].map((suffix) =>
        rm(`${databasePath}${suffix}`, { force: true }),
      ),
    );
  }
});

test("calculates Sao Paulo calendar-day boundaries across UTC midnight", () => {
  const { start, end } = getLocalDayBounds(new Date("2026-01-01T02:30:00.000Z"));

  assert.equal(start.toISOString(), "2025-12-31T03:00:00.000Z");
  assert.equal(end.toISOString(), "2026-01-01T03:00:00.000Z");
});

test("formats an empty history with guidance", () => {
  const message = formatHistory(
    [],
    { cafeina: 0, agua: 0, nicotina: 0 },
    new Date("2026-10-12T12:00:00.000Z"),
  );

  assert.match(message, /Resumo de hoje/);
  assert.match(message, /Cafeína: 0 mg/);
  assert.match(message, /Ainda nao ha registros/);
  assert.match(message, /\/historico|\/agua/);
});

test("formats history entries without exposing the Telegram user ID", () => {
  const message = formatHistory([
    {
      id: 1,
      telegramUserId: "private-user-id",
      type: "cafeina",
      amount: 80,
      unit: "mg",
      consumedAt: new Date("2026-10-12T12:00:00.000Z"),
      createdAt: new Date("2026-10-12T12:00:00.000Z"),
    },
  ]);

  assert.match(message, /Cafeína: 80 mg/);
  assert.doesNotMatch(message, /private-user-id/);
});
