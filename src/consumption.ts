import { db } from "./db/index.js";
import type { ConsumptionKind } from "./db/schema.js";
import { parseAmount } from "./amount.js";
import { isPrivateChatType } from "./privacy.js";

export interface ConsumptionCommandContext {
  chat?: { type: string };
  from?: { id: number };
  match?: string | RegExpMatchArray;
  reply(text: string): Promise<unknown>;
}

export interface ConsumptionEntry {
  telegramUserId: string;
  type: ConsumptionKind;
  amount: number;
  unit: string;
}

export type SaveConsumption = (entry: ConsumptionEntry) => Promise<unknown>;

const units: Record<ConsumptionKind, string> = {
  cafeina: "mg",
  agua: "ml",
  nicotina: "unidades",
};

export async function recordFromCommand(
  ctx: ConsumptionCommandContext,
  kind: ConsumptionKind,
  save: SaveConsumption = (data) => db.consumptionLog.create({ data }),
): Promise<void> {
  const chat = ctx.chat;
  if (!chat) {
    throw new Error("Telegram chat is missing from the command context");
  }
  if (!isPrivateChatType(chat.type)) {
    await ctx.reply("Por privacidade, use este comando em uma conversa privada com o bot.");
    return;
  }

  const amount = parseAmount(String(ctx.match ?? ""));
  if (amount === undefined) {
    const examples: Record<ConsumptionKind, string> = {
      cafeina: "/cafeina 80 (em mg)",
      agua: "/agua 250 (em ml)",
      nicotina: "/nicotina 1 (em unidades)",
    };
    await ctx.reply(`Informe uma quantidade inteira maior que zero. Exemplo: ${examples[kind]}`);
    return;
  }

  const telegramUserId = ctx.from?.id;
  if (telegramUserId === undefined) {
    throw new Error("Telegram user ID is missing from the command context");
  }

  try {
    await save({
      telegramUserId: String(telegramUserId),
      type: kind,
      amount,
      unit: units[kind],
    });
  } catch (error) {
    console.error("Falha ao persistir registro de consumo:", error);
    await ctx.reply("Nao consegui salvar o registro agora. Tente novamente mais tarde.");
    return;
  }

  await ctx.reply(`Registrado: ${amount} ${units[kind]} de ${kind}.`);
}
