import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

test("consumption records survive an abrupt process exit", async () => {
  const databaseFile = `persistence-${randomUUID()}.db`;
  const databaseUrl = `file:./${databaseFile}`;
  const databasePath = resolve("prisma", databaseFile);
  const env = { ...process.env, DATABASE_URL: databaseUrl };
  const prismaCli = resolve("node_modules", "prisma", "build", "index.js");
  let db: PrismaClient | undefined;

  try {
    const migration = spawnSync(
      process.execPath,
      [prismaCli, "migrate", "deploy"],
      { cwd: process.cwd(), env, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(migration.status, 0, migration.stderr);

    const telegramUserId = `crash-test-${randomUUID()}`;
    const writer = `
      import { PrismaClient } from "@prisma/client";
      const db = new PrismaClient();
      await db.consumptionLog.create({
        data: {
          telegramUserId: ${JSON.stringify(telegramUserId)},
          type: "agua",
          amount: 250,
          unit: "ml"
        }
      });
      process.exit(0);
    `;
    const write = spawnSync(
      process.execPath,
      ["--input-type=module", "-e", writer],
      { cwd: process.cwd(), env, encoding: "utf8", timeout: 30_000 },
    );
    assert.equal(write.status, 0, write.stderr);

    db = new PrismaClient({ datasourceUrl: databaseUrl });
    const record = await db.consumptionLog.findFirst({
      where: { telegramUserId },
    });

    assert.ok(record);
    assert.equal(record.amount, 250);
    assert.equal(record.unit, "ml");
  } finally {
    await db?.$disconnect();
    await Promise.all(
      ["", "-journal", "-shm", "-wal"].map((suffix) =>
        rm(`${databasePath}${suffix}`, { force: true }),
      ),
    );
  }
});
