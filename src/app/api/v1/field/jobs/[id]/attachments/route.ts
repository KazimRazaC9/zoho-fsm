import { ok, route } from "@/lib/api";
import { BadRequestError } from "@/lib/errors";
import { fieldService } from "@/modules/field";

/** POST /api/v1/field/jobs/{id}/attachments — multipart "file" (photo); kind=SIGNATURE for the customer's signature. */
export const POST = route({ roles: ["TECHNICIAN"], rateLimitPerMinute: 60 }, async ({ db, user, params, req }) => {
  const form = await req.formData().catch(() => {
    throw new BadRequestError("Send the file as multipart/form-data.");
  });
  const file = form.get("file");
  if (!(file instanceof File)) throw new BadRequestError("Choose a file to upload.", { file: ["Choose a file."] });
  return ok(
    await fieldService.uploadFile(db, user, params.id, file, form.get("kind") === "SIGNATURE"),
    "File uploaded.",
    201,
  );
});
