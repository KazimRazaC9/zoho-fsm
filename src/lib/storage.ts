import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { BadRequestError } from "./errors";

/**
 * Attachment storage on local disk under UPLOAD_DIR (never under /public: files are only served
 * through the authenticated download route). Swap this file for S3/Azure Blob in production.
 */

/** Allowed uploads: content type → file extension. Anything else is rejected. */
export const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "video/mp4": ".mp4",
  "video/quicktime": ".mov",
  "video/webm": ".webm",
  "application/pdf": ".pdf",
  "text/plain": ".txt",
  "text/csv": ".csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
};

/** Types a browser may show inline (no HTML/SVG/script-capable types). */
export const INLINE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

export const isVideoType = (type: string) => type.startsWith("video/");

const root = () => path.resolve(env.UPLOAD_DIR);

/** Resolve a storage key and refuse anything that escapes the upload directory. */
function resolveKey(key: string) {
  const full = path.resolve(root(), key);
  if (!full.startsWith(root() + path.sep)) throw new BadRequestError("Invalid file key.");
  return full;
}

/** Display name without path parts or control characters. */
export function safeFileName(name: string) {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|:*?]/g, "_").trim();
  return (cleaned || "file").slice(0, 200);
}

/** Validates and stores a file; returns its storage key. */
export async function saveFile(
  companyId: string,
  file: File,
): Promise<{ key: string; contentType: string; size: number }> {
  const ext = ALLOWED_TYPES[file.type];
  if (!ext)
    throw new BadRequestError(
      "This file type is not allowed. Use JPG, PNG, WEBP, HEIC, MP4, MOV, WEBM, PDF, TXT, CSV, DOCX or XLSX.",
    );
  const maxMb = isVideoType(file.type) ? env.MAX_VIDEO_MB : env.MAX_UPLOAD_MB;
  if (file.size === 0) throw new BadRequestError("The file is empty.");
  if (file.size > maxMb * 1024 * 1024)
    throw new BadRequestError(`${isVideoType(file.type) ? "Videos" : "Files"} can be at most ${maxMb} MB.`);

  const now = new Date();
  const key = [
    companyId,
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    `${randomUUID()}${ext}`,
  ].join("/");
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, Buffer.from(await file.arrayBuffer()), { flag: "wx" });
  return { key, contentType: file.type, size: file.size };
}

export async function readStoredFile(key: string): Promise<Buffer> {
  return readFile(resolveKey(key));
}

/** Best effort: a missing file is not an error. */
export async function deleteStoredFile(key: string): Promise<void> {
  await unlink(resolveKey(key)).catch(() => undefined);
}
