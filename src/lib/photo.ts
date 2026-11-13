import sharp from "sharp";

/**
 * Photo compression, done on the server for every photo that is uploaded, so the disk (and every
 * download) stays small however the photo was taken:
 *  - the picture is turned upright using its camera orientation, then the camera's hidden data
 *    (location, device, time) is dropped;
 *  - it is shrunk to at most PHOTO_MAX_EDGE pixels on its long side and saved as a JPEG;
 *  - a small thumbnail is made for lists and grids.
 *
 * 1920 px at quality 80 keeps small print (an odometer, a serial number) readable and is typically
 * 250-500 KB instead of 3-6 MB. No Next.js imports, so scripts can use it too.
 */
export const PHOTO_MAX_EDGE = 1920;
export const PHOTO_QUALITY = 80;
export const THUMB_EDGE = 400;
export const THUMB_QUALITY = 70;

export type CompressedPhoto = { data: Buffer; thumb: Buffer; width: number; height: number };

/** Throws when the bytes are not a readable image. */
export async function compressPhoto(input: Buffer): Promise<CompressedPhoto> {
  // Decide by what the bytes really are, not by what the upload claims: an SVG, GIF, PDF or TIFF that
  // is labeled "image/png" must never reach the image decoder.
  const { format } = await sharp(input).metadata();
  if (format !== "jpeg" && format !== "png" && format !== "webp")
    throw new Error(`Unsupported image format: ${format}`);

  const main = await sharp(input, { failOn: "error" })
    .rotate()
    .resize({ width: PHOTO_MAX_EDGE, height: PHOTO_MAX_EDGE, fit: "inside", withoutEnlargement: true })
    // A transparent PNG becomes white instead of black when saved as JPEG.
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: PHOTO_QUALITY, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const thumb = await sharp(main.data)
    .resize({ width: THUMB_EDGE, height: THUMB_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
    .toBuffer();

  return { data: main.data, thumb, width: main.info.width, height: main.info.height };
}
