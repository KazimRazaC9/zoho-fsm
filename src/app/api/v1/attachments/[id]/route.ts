import { route } from "@/lib/api";
import { INLINE_TYPES } from "@/lib/storage";
import { assertMine } from "@/modules/field";
import { workOrdersService } from "@/modules/work-orders";

/** "bytes=START-END" → the slice to send, or null when it is not a usable single range. */
function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!m || (m[1] === "" && m[2] === "")) return null;
  let start: number;
  let end: number;
  if (m[1] === "") {
    // "bytes=-500": the last 500 bytes.
    start = Math.max(0, size - Number(m[2]));
    end = size - 1;
  } else {
    start = Number(m[1]);
    end = m[2] === "" ? size - 1 : Math.min(Number(m[2]), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
}

/**
 * GET /api/v1/attachments/{id}[?inline=1] — streams the file to a signed-in user of the same company.
 * Only images, videos and PDFs are ever shown inline; everything else downloads. Byte ranges are
 * supported because Safari and iOS will not play a video without them.
 */
export const GET = route({ roles: ["ADMIN", "DISPATCHER", "TECHNICIAN"] }, async ({ db, user, params, req }) => {
  const { meta, data } = await workOrdersService.readAttachment(db, params.id);
  // Technicians only see files of jobs assigned to them.
  if (user.role === "TECHNICIAN") await assertMine(db, user, meta.entityId);
  const type = meta.contentType ?? "application/octet-stream";
  const inline = req.nextUrl.searchParams.get("inline") === "1" && INLINE_TYPES.has(type);
  const headers: Record<string, string> = {
    "Content-Type": inline ? type : "application/octet-stream",
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`,
    "Cache-Control": "private, max-age=300",
    "Accept-Ranges": "bytes",
    "Content-Security-Policy":
      "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox",
  };
  const rangeHeader = req.headers.get("range");
  const range = parseRange(rangeHeader, data.length);
  if (rangeHeader && !range) {
    return new Response(null, { status: 416, headers: { ...headers, "Content-Range": `bytes */${data.length}` } });
  }
  if (range) {
    const part = data.subarray(range.start, range.end + 1);
    return new Response(new Uint8Array(part), {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(part.length),
        "Content-Range": `bytes ${range.start}-${range.end}/${data.length}`,
      },
    });
  }
  return new Response(new Uint8Array(data), { headers: { ...headers, "Content-Length": String(data.length) } });
});
