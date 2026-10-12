import { bot } from "./bot.js";
import { db } from "./db/index.js";

await bot.api.setMyCommands([
  { command: "start", description: "Ver instrucoes" },
  { command: "cafeina", description: "Registrar cafeina em mg" },
  { command: "agua", description: "Registrar agua em ml" },
  { command: "nicotina", description: "Registrar nicotina em unidades" },
  { command: "historico", description: "Resumo do dia e historico recente" },
]);

async function shutdown(signal: string): Promise<void> {
  console.log(`Recebido ${signal}; encerrando bot.`);
  await bot.stop();
  await db.$disconnect();
  process.exitCode = 0;
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

void bot
  .start({
    onStart: (botInfo) => console.log(`Bot @${botInfo.username} iniciado via polling`),
  })
  .catch(async (error: unknown) => {
    console.error("Falha ao iniciar o bot:", error);
    await db.$disconnect();
    process.exitCode = 1;
  });
