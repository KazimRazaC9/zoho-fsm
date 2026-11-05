import { ok, route } from "@/lib/api";
import { BadRequestError } from "@/lib/errors";
import { workOrdersService } from "@/modules/work-orders";

/**
 * POST /api/v1/work-orders/{id}/attachments — multipart/form-data with field "file"
 * (JPG, PNG, WEBP, HEIC, PDF, TXT, CSV, DOCX, XLSX; MAX_UPLOAD_MB). kind=SIGNATURE marks a signature.
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
    return ok(await workOrdersService.addAttachment(db, user, params.id, file, kind), "File uploaded.", 201);
  },
);
