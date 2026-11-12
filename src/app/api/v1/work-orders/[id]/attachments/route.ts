import { ok, route } from "@/lib/api";
import { BadRequestError } from "@/lib/errors";
import { evidenceFieldsFrom, workOrdersService } from "@/modules/work-orders";

/**
 * POST /api/v1/work-orders/{id}/attachments — multipart/form-data with field "file"
 * (JPG, PNG, WEBP, HEIC, MP4, MOV, WEBM, PDF, TXT, CSV, DOCX, XLSX; MAX_UPLOAD_MB, videos MAX_VIDEO_MB).
 * kind=SIGNATURE marks a signature. phase=BEFORE|AFTER (and optionally issueId) makes it before/after proof:
 * at most 4 photos and 1 video per phase, per reported problem or issue.
 */
export const POST = route(
  { roles: ["ADMIN", "DISPATCHER"], rateLimitPerMinute: 60 },
  async ({ db, user, params, req }) => {
    const form = await req.formData().catch(() => {
      throw new BadRequestError("Send the file as multipart/form-data.");
    });
    const file = form.get("file");
    if (!(file instanceof File))
      throw new BadRequestError("Choose a file to upload.", { file: ["Choose a file to upload."] });
    const kind = form.get("kind") === "SIGNATURE" ? "SIGNATURE" : undefined;
    return ok(
      await workOrdersService.addAttachment(db, user, params.id, file, { kind, ...evidenceFieldsFrom(form) }),
      "File uploaded.",
      201,
    );
  },
);
