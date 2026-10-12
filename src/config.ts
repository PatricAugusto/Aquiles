import "dotenv/config";
import { z } from "zod";

const configSchema = z.object({
  BOT_TOKEN: z.string().min(1, "BOT_TOKEN is required"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
});

export const config = configSchema.parse(process.env);
