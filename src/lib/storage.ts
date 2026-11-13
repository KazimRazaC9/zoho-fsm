import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "./env";
import { BadRequestError } from "./errors";
import { compressPhoto } from "./photo";
import { logger } from "./logger";

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
  "audio/webm": ".weba",
  "audio/mp4": ".m4a",
  "audio/mpeg": ".mp3",
  "audio/ogg": ".ogg",
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
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/ogg",
]);

export const isVideoType = (type: string) => type.startsWith("video/");
export const isAudioType = (type: string) => type.startsWith("audio/");

/** "audio/webm;codecs=opus" → "audio/webm": browsers add the codec to recordings. */
export const baseType = (type: string) => type.split(";")[0].trim().toLowerCase();

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

export type StoredFile = {
  key: string;
  /** Small preview of a photo; absent for everything else. */
  thumbKey?: string;
  contentType: string;
  size: number;
};

/** "front.png" → "front.jpg" once the picture has been saved as a JPEG. */
export function nameForType(name: string, contentType: string) {
  const ext = ALLOWED_TYPES[contentType];
  if (!ext || contentType !== "image/jpeg") return name;
  return /\.jpe?g$/i.test(name) ? name : `${name.replace(/\.[^./\\]{1,5}$/, "")}${ext}`;
}

/**
 * Validates and stores a file. Photos are compressed on the way in (see photo.ts) and get a small
 * thumbnail; `compress: false` keeps a photo exactly as sent (used for the customer's signature).
 */
export async function saveFile(companyId: string, file: File, opts: { compress?: boolean } = {}): Promise<StoredFile> {
  const type = baseType(file.type);
  let ext = ALLOWED_TYPES[type];
  if (!ext)
    throw new BadRequestError(
      "This file type is not allowed. Use JPG, PNG, WEBP, HEIC, MP4, MOV, WEBM, audio recordings, PDF, TXT, CSV, DOCX or XLSX.",
    );
  const isImage = type.startsWith("image/");
  const maxMb = isVideoType(type) ? env.MAX_VIDEO_MB : isImage ? env.MAX_PHOTO_MB : env.MAX_UPLOAD_MB;
  if (file.size === 0) throw new BadRequestError("The file is empty.");
  if (file.size > maxMb * 1024 * 1024)
    throw new BadRequestError(
      `${isVideoType(type) ? "Videos" : isImage ? "Photos" : "Files"} can be at most ${maxMb} MB.`,
    );

  let bytes: Buffer = Buffer.from(await file.arrayBuffer());
  let thumb: Buffer | undefined;
  let contentType = type;
  if (isImage && opts.compress !== false) {
    try {
      const photo = await compressPhoto(bytes);
      bytes = photo.data;
      thumb = photo.thumb;
      contentType = "image/jpeg";
      ext = ALLOWED_TYPES["image/jpeg"];
    } catch (err) {
      // HEIC is not readable by the server's image library: keep it as sent. Anything else that is not
      // a real picture is refused.
      if (type !== "image/heic") {
        logger.warn({ err }, "photo.unreadable");
        throw new BadRequestError("This photo could not be read. Take it again or choose another one.", {
          file: ["Not a readable photo."],
        });
      }
    }
  }

  const now = new Date();
  const base = [companyId, now.getUTCFullYear(), String(now.getUTCMonth() + 1).padStart(2, "0"), randomUUID()].join(
    "/",
  );
  const key = `${base}${ext}`;
  const full = resolveKey(key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes, { flag: "wx" });
  let thumbKey: string | undefined;
  if (thumb) {
    thumbKey = `${base}.thumb.jpg`;
    await writeFile(resolveKey(thumbKey), thumb, { flag: "wx" });
  }
  return { key, thumbKey, contentType, size: bytes.length };
}

export async function readStoredFile(key: string): Promise<Buffer> {
  return readFile(resolveKey(key));
}

/** Best effort: a missing file is not an error. */
export async function deleteStoredFile(key: string): Promise<void> {
  await unlink(resolveKey(key)).catch(() => undefined);
}
