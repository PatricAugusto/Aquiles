import type { ConsumptionLog, PrismaClient } from "@prisma/client";
import { db } from "./db/index.js";
import { isPrivateChatType } from "./privacy.js";

export const HISTORY_LIMIT = 10;
export const HISTORY_TIME_ZONE = "America/Sao_Paulo";

export interface HistoryCommandContext {
  chat?: { type: string };
  from?: { id: number };
  reply(text: string): Promise<unknown>;
}

export type ConsumptionTotals = Record<"cafeina" | "agua" | "nicotina", number>;

export interface HistoryDataSource {
  findHistory(telegramUserId: string): Promise<ConsumptionLog[]>;
  getDailyTotals(
    telegramUserId: string,
    now?: Date,
  ): Promise<ConsumptionTotals>;
}

const consumptionKinds = ["cafeina", "agua", "nicotina"] as const;

const consumptionLabels: Record<string, string> = {
  cafeina: "Cafeína",
  agua: "Água",
  nicotina: "Nicotina",
};

const consumptionUnits: Record<keyof ConsumptionTotals, string> = {
  cafeina: "mg",
  agua: "ml",
  nicotina: "unidades",
};

const localDateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: HISTORY_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const consumedAtFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: HISTORY_TIME_ZONE,
});

const historyDateFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: HISTORY_TIME_ZONE,
});

const emptyTotals: ConsumptionTotals = {
  cafeina: 0,
  agua: 0,
  nicotina: 0,
};

function getLocalDateKey(date: Date): number {
  const parts = localDateFormatter.formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return Number(`${values.year}${values.month}${values.day}`);
}

function findLocalDayStart(localDateKey: number): Date {
  const year = Math.floor(localDateKey / 10_000);
  const month = Math.floor((localDateKey % 10_000) / 100);
  const day = localDateKey % 100;
  const nominalMidnight = Date.UTC(year, month - 1, day);
  let low = nominalMidnight - 36 * 60 * 60 * 1000;
  let high = nominalMidnight + 36 * 60 * 60 * 1000;

  while (high - low > 1) {
    const midpoint = Math.floor((low + high) / 2);
    if (getLocalDateKey(new Date(midpoint)) >= localDateKey) {
      high = midpoint;
    } else {
      low = midpoint;
    }
  }

  return new Date(high);
}

export function getLocalDayBounds(now: Date): { start: Date; end: Date } {
  const todayKey = getLocalDateKey(now);
  const todayParts = new Date(Date.UTC(
    Math.floor(todayKey / 10_000),
    Math.floor((todayKey % 10_000) / 100) - 1,
    todayKey % 100,
  ));
  const nextDate = new Date(Date.UTC(
    todayParts.getUTCFullYear(),
    todayParts.getUTCMonth(),
    todayParts.getUTCDate() + 1,
  ));
  const nextDayKey = Number(
    `${nextDate.getUTCFullYear()}${String(nextDate.getUTCMonth() + 1).padStart(2, "0")}${String(nextDate.getUTCDate()).padStart(2, "0")}`,
  );

  return {
    start: findLocalDayStart(todayKey),
    end: findLocalDayStart(nextDayKey),
  };
}

export function getRecentConsumptionLogs(
  prisma: PrismaClient,
  telegramUserId: string,
): Promise<ConsumptionLog[]> {
  return prisma.consumptionLog.findMany({
    where: { telegramUserId },
    orderBy: [{ consumedAt: "desc" }, { id: "desc" }],
    take: HISTORY_LIMIT,
  });
}

export async function getDailyConsumptionTotals(
  prisma: PrismaClient,
  telegramUserId: string,
  now = new Date(),
): Promise<ConsumptionTotals> {
  const { start, end } = getLocalDayBounds(now);
  const groups = await prisma.consumptionLog.groupBy({
    by: ["type"],
    where: {
      telegramUserId,
      consumedAt: { gte: start, lt: end },
    },
    _sum: { amount: true },
  });
  const totals = { ...emptyTotals };

  for (const group of groups) {
    const kind = consumptionKinds.find((candidate) => candidate === group.type);
    if (kind) {
      totals[kind] = group._sum.amount ?? 0;
    }
  }

  return totals;
}

export function formatHistory(
  logs: readonly ConsumptionLog[],
  totals: ConsumptionTotals = emptyTotals,
  now = new Date(),
): string {
  const summary = [
    `Resumo de hoje (${historyDateFormatter.format(now)}):`,
    ...consumptionKinds.map(
      (kind) => `• ${consumptionLabels[kind]}: ${totals[kind]} ${consumptionUnits[kind]}`,
    ),
  ].join("\n");

  if (logs.length === 0) {
    return [
      summary,
      "",
      "Ainda nao ha registros de consumo.",
      "Experimente /cafeina 80, /agua 250 ou /nicotina 1.",
    ].join("\n");
  }

  const entries = logs.map((log) => {
    const label = consumptionLabels[log.type] ?? log.type;
    const consumedAt = consumedAtFormatter.format(log.consumedAt);
    return `• ${consumedAt} — ${label}: ${log.amount} ${log.unit}`;
  });

  return `${summary}\n\nHistorico recente (ultimos ${HISTORY_LIMIT} registros):\n\n${entries.join("\n")}`;
}

const prismaHistoryDataSource: HistoryDataSource = {
  findHistory: (telegramUserId) => getRecentConsumptionLogs(db, telegramUserId),
  getDailyTotals: (telegramUserId, now) =>
    getDailyConsumptionTotals(db, telegramUserId, now),
};

export async function showHistory(
  ctx: HistoryCommandContext,
  dataSource: HistoryDataSource = prismaHistoryDataSource,
): Promise<void> {
  const chat = ctx.chat;
  if (!chat) {
    throw new Error("Telegram chat is missing from the command context");
  }
  if (!isPrivateChatType(chat.type)) {
    await ctx.reply("Por privacidade, consulte o historico em uma conversa privada com o bot.");
    return;
  }

  const telegramUserId = ctx.from?.id;
  if (telegramUserId === undefined) {
    throw new Error("Telegram user ID is missing from the command context");
  }

  try {
    const userId = String(telegramUserId);
    const [logs, totals] = await Promise.all([
      dataSource.findHistory(userId),
      dataSource.getDailyTotals(userId),
    ]);
    await ctx.reply(formatHistory(logs, totals));
  } catch (error) {
    console.error("Falha ao consultar historico de consumo:", error);
    await ctx.reply("Nao consegui consultar seu historico agora. Tente novamente mais tarde.");
  }
}
