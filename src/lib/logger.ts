import "server-only";
import pino from "pino";

/** JSON logs (one line per event). Pipe through `pino-pretty` locally if you want colours. */
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { app: "fieldserve" },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "password",
      "*.password",
      "passwordHash",
      "*.passwordHash",
      "refreshToken",
      "*.refreshToken",
      "accessToken",
      "*.accessToken",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[redacted]",
  },
});

export type Logger = typeof logger;
