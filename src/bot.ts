import { Bot } from "grammy";
import { config } from "./config.js";
import { recordFromCommand } from "./consumption.js";
import { showHistory } from "./history.js";

export const bot = new Bot(config.BOT_TOKEN);

bot.command("start", async (ctx) => {
  await ctx.reply(
    [
      "Ola! Posso registrar seu consumo:",
      "/cafeina <mg>",
      "/agua <ml>",
      "/nicotina <unidades>",
      "/historico — ver os ultimos 10 registros",
    ].join("\n"),
  );
});

bot.command("cafeina", (ctx) => recordFromCommand(ctx, "cafeina"));
bot.command("agua", (ctx) => recordFromCommand(ctx, "agua"));
bot.command("nicotina", (ctx) => recordFromCommand(ctx, "nicotina"));
bot.command("historico", showHistory);

bot.catch(({ error, ctx }) => {
  console.error(`Falha ao processar update ${ctx.update.update_id}:`, error);
});
