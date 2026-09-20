/** Client-side rules for review attachments (mirrors storefront `review-upload-rules`). */

export const REVIEW_MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const REVIEW_MAX_VIDEO_BYTES = 5 * 1024 * 1024;
export const REVIEW_MAX_FILES = 6;

export type ReviewMediaKind = "image" | "video";

export type ValidatedReviewFile = {
  file: File;
  kind: ReviewMediaKind;
};

export type ReviewFileValidationError = {
  fileName: string;
  message: string;
};

function isImageType(file: File): boolean {
  return file.type.startsWith("image/");
}

function isVideoType(file: File): boolean {
  return file.type.startsWith("video/");
}

export function validateReviewFiles(
  files: FileList | File[] | null | undefined,
): { ok: true; files: ValidatedReviewFile[] } | { ok: false; errors: ReviewFileValidationError[] } {
  const list = files ? Array.from(files) : [];
  const errors: ReviewFileValidationError[] = [];
  const out: ValidatedReviewFile[] = [];

  if (list.length > REVIEW_MAX_FILES) {
    return {
      ok: false,
      errors: [
        {
          fileName: "",
          message: `You can attach at most ${REVIEW_MAX_FILES} files.`,
        },
      ],
    };
  }

  for (const file of list) {
    const name = file.name || "file";
    if (!isImageType(file) && !isVideoType(file)) {
      errors.push({
        fileName: name,
        message: "Only image and video files are allowed.",
      });
      continue;
    }
    if (isImageType(file)) {
      if (file.size > REVIEW_MAX_IMAGE_BYTES) {
        errors.push({
          fileName: name,
          message: "Each image must be 2 MB or smaller.",
        });
        continue;
      }
      out.push({ file, kind: "image" });
      continue;
    }
    if (file.size > REVIEW_MAX_VIDEO_BYTES) {
      errors.push({
        fileName: name,
        message: "Each video must be 5 MB or smaller.",
      });
      continue;
    }
    out.push({ file, kind: "video" });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }
  return { ok: true, files: out };
}

export function sanitizeReviewStorageName(original: string): string {
  const base = original.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^\.+/, "");
  return base.length > 0 ? base.slice(0, 120) : "file";
}
