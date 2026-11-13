import "server-only";
import { z } from "zod";

/** Server environment, validated once at startup. Import only from server code. */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(14),
  UPLOAD_DIR: z.string().default("./uploads"),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(100).default(10),
  /** Largest photo accepted as input: it is shrunk on the server, so the limit is generous. */
  MAX_PHOTO_MB: z.coerce.number().int().min(1).max(100).default(25),
  /** Videos are much larger than photos and documents. */
  MAX_VIDEO_MB: z.coerce.number().int().min(1).max(500).default(50),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
  throw new Error(`Invalid environment: ${issues}`);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";
