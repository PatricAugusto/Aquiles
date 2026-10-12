import type { ConsumptionLog, PrismaClient } from "@prisma/client";
import { db } from "./db/index.js";
import { isPrivateChatType } from "./privacy.js";

export const HISTORY_LIMIT = 10;

export interface HistoryCommandContext {
  chat?: { type: string };
  from?: { id: number };
  reply(text: string): Promise<unknown>;
}

type FindHistory = (telegramUserId: string) => Promise<ConsumptionLog[]>;

const consumptionLabels: Record<string, string> = {
  cafeina: "Cafeína",
  agua: "Água",
  nicotina: "Nicotina",
};

const consumedAtFormatter = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Sao_Paulo",
});

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

export function formatHistory(logs: readonly ConsumptionLog[]): string {
  if (logs.length === 0) {
    return [
      "Ainda nao ha registros de consumo.",
      "Experimente /cafeina 80, /agua 250 ou /nicotina 1.",
    ].join("\n");
  }

  const entries = logs.map((log) => {
    const label = consumptionLabels[log.type] ?? log.type;
    const consumedAt = consumedAtFormatter.format(log.consumedAt);
    return `• ${consumedAt} — ${label}: ${log.amount} ${log.unit}`;
  });

  return `Historico recente (ultimos ${HISTORY_LIMIT} registros):\n\n${entries.join("\n")}`;
}

export async function showHistory(
  ctx: HistoryCommandContext,
  findHistory: FindHistory = (telegramUserId) =>
    getRecentConsumptionLogs(db, telegramUserId),
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
    const logs = await findHistory(String(telegramUserId));
    await ctx.reply(formatHistory(logs));
  } catch (error) {
    console.error("Falha ao consultar historico de consumo:", error);
    await ctx.reply("Nao consegui consultar seu historico agora. Tente novamente mais tarde.");
  }
}
