import type { Context } from "grammy";
import { db } from "./db/index.js";
import type { ConsumptionKind } from "./db/schema.js";
import { parseAmount } from "./amount.js";

const units: Record<ConsumptionKind, string> = {
  cafeina: "mg",
  agua: "ml",
  nicotina: "unidades",
};

export async function recordFromCommand(
  ctx: Context,
  kind: ConsumptionKind,
): Promise<void> {
  const chat = ctx.chat;
  if (!chat) {
    throw new Error("Telegram chat is missing from the command context");
  }
  if (chat.type !== "private") {
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
    await db.consumptionLog.create({
      data: {
        telegramUserId: String(telegramUserId),
        type: kind,
        amount,
        unit: units[kind],
      },
    });
  } catch (error) {
    console.error("Falha ao persistir registro de consumo:", error);
    await ctx.reply("Nao consegui salvar o registro agora. Tente novamente mais tarde.");
    return;
  }

  await ctx.reply(`Registrado: ${amount} ${units[kind]} de ${kind}.`);
}
