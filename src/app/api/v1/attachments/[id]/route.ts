import { route } from "@/lib/api";
import { INLINE_TYPES } from "@/lib/storage";
import { assertMine } from "@/modules/field";
import { workOrdersService } from "@/modules/work-orders";

/**
 * GET /api/v1/attachments/{id}[?inline=1] — streams the file to a signed-in user of the same company.
 * Only images and PDFs are ever shown inline; everything else downloads.
 */
export const GET = route({ roles: ["ADMIN", "DISPATCHER", "TECHNICIAN"] }, async ({ db, user, params, req }) => {
  const { meta, data } = await workOrdersService.readAttachment(db, params.id);
  // Technicians only see files of jobs assigned to them.
  if (user.role === "TECHNICIAN") await assertMine(db, user, meta.entityId);
  const type = meta.contentType ?? "application/octet-stream";
  const inline = req.nextUrl.searchParams.get("inline") === "1" && INLINE_TYPES.has(type);
  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": inline ? type : "application/octet-stream",
      "Content-Length": String(data.length),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(meta.fileName)}`,
      "Cache-Control": "private, max-age=300",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
});
