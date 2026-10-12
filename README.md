# Bot de registro de consumo

Bot Telegram em TypeScript com grammY. Os comandos registram consumos individuais
em SQLite usando Prisma:

- `/cafeina <mg>` — quantidade inteira em miligramas;
- `/agua <ml>` — quantidade inteira em mililitros;
- `/nicotina <unidades>` — quantidade inteira de cigarros/unidades;
- `/historico` — mostra a soma do dia atual (horario de Brasilia) por categoria
  e os 10 registros mais recentes do proprio usuario.

## Desenvolvimento local

Requisito: Node.js 22+.

1. Crie um bot pelo `@BotFather` e copie o token.
2. Copie `.env.example` para `.env` e preencha `BOT_TOKEN`.
3. Instale dependências: `npm install`.
4. Gere e aplique a migration inicial: `npm run db:migrate -- --name init`.
5. Rode o bot: `npm run dev`.

O Prisma Client e seus tipos são gerados automaticamente após `npm install`.
Se o editor ainda marcar tipos Prisma como ausentes, execute
`npm run db:generate` e reinicie o servidor TypeScript do editor.

O banco local fica em `prisma/dev.db` (configurado em `.env.example`). Faça
backup desse arquivo e mantenha-o fora do controle de versão.

Os comandos só confirmam o registro depois que o Prisma conclui a gravação no
SQLite. A migration cria o banco em arquivo, não em memória; portanto os dados
continuam disponíveis após reiniciar ou encerrar abruptamente o processo,
desde que o arquivo permaneça em armazenamento persistente. Em hospedagens
com disco efêmero, monte um volume persistente e mantenha backups.

Para rodar os testes unitários e de segurança:
`npm test`. Para relatório de cobertura com limites mínimos de 90% de linhas e
80% de branches: `npm run test:coverage`. Para auditar todas as dependências,
incluindo as de desenvolvimento: `npm run security:check`.

GitHub Actions repete type-check, testes, cobertura, build e auditoria em Node
22/24 e Windows/Linux a cada push e pull request.

Os dados pessoais são identificados pelo ID do usuário no Telegram. O bot deve
ser usado em conversa privada; antes de produção, defina política de retenção,
exportação e exclusão de registros. Não publique o token do bot nem o arquivo
`.env`.

O modo local usa long polling. SQLite é uma boa opção para este MVP individual,
com baixo volume e uma única instância do bot. Para deploy, use armazenamento
persistente para o arquivo do banco e não execute múltiplas instâncias que
escrevam nele simultaneamente. Se houver concorrência elevada ou necessidade de
escalar horizontalmente, reavalie PostgreSQL. Em produção, configure webhook
HTTPS, backups e monitoramento de erros.

Para aplicar migrations já versionadas em produção, execute
`npm run db:deploy` antes de iniciar o bot.
