/**
 * One-off: compresses photos that were uploaded before server-side compression existed, and gives them a
 * thumbnail. Safe to re-run (photos that already have a thumbnail are skipped).
 *   pnpm photos:compress
 * Runs as the database OWNER (DIRECT_DATABASE_URL), like the seed.
 */
import "dotenv/config";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { compressPhoto } from "../src/lib/photo";

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_DATABASE_URL });
const root = path.resolve(process.env.UPLOAD_DIR ?? "./uploads");
const at = (key: string) => path.join(root, key);

async function main() {
  const rows = await prisma.attachment.findMany({
    where: { kind: "PHOTO", thumbKey: null, contentType: { in: ["image/jpeg", "image/png", "image/webp"] } },
    select: { id: true, fileName: true, storageKey: true, sizeBytes: true },
  });
  let saved = 0;
  let done = 0;
  for (const row of rows) {
    try {
      const photo = await compressPhoto(await readFile(at(row.storageKey)));
      const base = row.storageKey.replace(/\.[^./\\]+$/, "");
      const key = `${base}.jpg`;
      const thumbKey = `${base}.thumb.jpg`;
      await mkdir(path.dirname(at(key)), { recursive: true });
      await writeFile(at(key), photo.data);
      await writeFile(at(thumbKey), photo.thumb);
      if (key !== row.storageKey) await unlink(at(row.storageKey)).catch(() => undefined);
      await prisma.attachment.update({
        where: { id: row.id },
        data: {
          storageKey: key,
          thumbKey,
          contentType: "image/jpeg",
          sizeBytes: photo.data.length,
          fileName: /\.jpe?g$/i.test(row.fileName)
            ? row.fileName
            : `${row.fileName.replace(/\.[^./\\]{1,5}$/, "")}.jpg`,
        },
      });
      saved += (row.sizeBytes ?? photo.data.length) - photo.data.length;
      done++;
    } catch (err) {
      console.warn(`Skipped ${row.id} (${row.storageKey}):`, (err as Error).message);
    }
  }
  console.log(`Compressed ${done} of ${rows.length} photos, saved about ${(saved / 1024 / 1024).toFixed(1)} MB.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
