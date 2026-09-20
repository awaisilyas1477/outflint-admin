/**
 * Browser-side image processing for admin uploads.
 *
 * Two flows are supported:
 *   1. Manual crop (preferred): the admin picks a crop rectangle in
 *      <ImageCropDialog>, then we render that rectangle into a fixed-size
 *      canvas via {@link cropAndExport}.
 *   2. Auto cover-crop fallback: {@link resizeForOg} / {@link resizeForLogo}
 *      center-crop without UI. Kept for programmatic / backwards-compat use,
 *      but the admin UI has been migrated to (1) so admins keep control.
 *
 * No third-party imaging dep: pure Canvas2D with `imageSmoothingQuality: "high"`,
 * which is plenty for the marketing imagery we ship at 1200×630 / 512×512.
 */

export const OG_TARGET_WIDTH = 1200;
export const OG_TARGET_HEIGHT = 630;
export const LOGO_TARGET_SIZE = 512;

const SOURCE_MAX_BYTES = 30 * 1024 * 1024; // hard cap on source memory cost
const JPEG_QUALITY = 0.85;

export type ResizeResult = {
  /** New File, ready to upload. Always has a fresh name + correct mime. */
  file: File;
  /** Output dimensions. */
  width: number;
  height: number;
  /** Output bytes. */
  bytes: number;
  /** Source dimensions before processing (0 when unknown — e.g. SVG passthrough). */
  originalWidth: number;
  originalHeight: number;
  /** Source bytes. */
  originalBytes: number;
  /**
   * True when the cropped source rectangle was smaller than the target
   * (so we had to scale up — image will look soft).
   */
  upscaled: boolean;
  /** True when the source was returned as-is (e.g. SVG). */
  passedThrough: boolean;
};

type Decoded = {
  width: number;
  height: number;
  draw(
    ctx: CanvasRenderingContext2D,
    sx: number,
    sy: number,
    sw: number,
    sh: number,
    dx: number,
    dy: number,
    dw: number,
    dh: number,
  ): void;
  release(): void;
};

function isImageMime(file: File): boolean {
  return typeof file.type === "string" && file.type.startsWith("image/");
}

function isSvg(file: File): boolean {
  return file.type === "image/svg+xml";
}

async function decodeViaImageBitmap(file: File): Promise<Decoded | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(file);
    return {
      width: bitmap.width,
      height: bitmap.height,
      draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) =>
        ctx.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh),
      release: () => bitmap.close?.(),
    };
  } catch {
    return null;
  }
}

async function decodeViaImgTag(file: File): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("Could not decode image."));
      i.decoding = "async";
      i.src = url;
    });
    return {
      width: img.naturalWidth,
      height: img.naturalHeight,
      draw: (ctx, sx, sy, sw, sh, dx, dy, dw, dh) =>
        ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh),
      release: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

async function decode(file: File): Promise<Decoded> {
  return (await decodeViaImageBitmap(file)) ?? (await decodeViaImgTag(file));
}

/** Cover-fit (center-crop): largest centered rectangle of source matching dst aspect. */
function coverCrop(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  if (srcW <= 0 || srcH <= 0) return { sx: 0, sy: 0, sw: srcW, sh: srcH };
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;
  let sw: number;
  let sh: number;
  if (srcRatio > dstRatio) {
    sh = srcH;
    sw = Math.round(srcH * dstRatio);
  } else {
    sw = srcW;
    sh = Math.round(srcW / dstRatio);
  }
  return {
    sx: Math.max(0, Math.floor((srcW - sw) / 2)),
    sy: Math.max(0, Math.floor((srcH - sh) / 2)),
    sw,
    sh,
  };
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas export failed."))),
      type,
      quality,
    );
  });
}

function buildOutputName(srcName: string, ext: "jpg" | "png"): string {
  const base = (srcName || "image").replace(/\.[^.]+$/, "").trim();
  const safe = base.replace(/[^\w.-]+/g, "-").slice(0, 80) || "image";
  return `${safe}.${ext}`;
}

export type CropTarget =
  | { kind: "og" }
  | { kind: "logo" }
  | { kind: "custom"; width: number; height: number; outputType: "image/jpeg" | "image/png" };

type TargetSpec = {
  width: number;
  height: number;
  outputType: "image/jpeg" | "image/png";
  outputExt: "jpg" | "png";
  alpha: boolean;
  background?: string;
};

function targetSpec(t: CropTarget): TargetSpec {
  if (t.kind === "og") {
    return {
      width: OG_TARGET_WIDTH,
      height: OG_TARGET_HEIGHT,
      outputType: "image/jpeg",
      outputExt: "jpg",
      alpha: false,
      background: "#000000",
    };
  }
  if (t.kind === "logo") {
    return {
      width: LOGO_TARGET_SIZE,
      height: LOGO_TARGET_SIZE,
      outputType: "image/png",
      outputExt: "png",
      alpha: true,
    };
  }
  return {
    width: t.width,
    height: t.height,
    outputType: t.outputType,
    outputExt: t.outputType === "image/png" ? "png" : "jpg",
    alpha: t.outputType === "image/png",
  };
}

/** Pixel rectangle in the source image's coordinate space. */
export type CropPixels = { x: number; y: number; width: number; height: number };

async function rasterise(
  file: File,
  spec: TargetSpec,
  crop: CropPixels | null,
): Promise<ResizeResult> {
  if (!isImageMime(file)) {
    throw new Error("File is not an image.");
  }
  if (file.size > SOURCE_MAX_BYTES) {
    throw new Error("Source image is larger than 30 MB — please use a smaller file.");
  }

  // Vector → don't rasterise; admin presumably wants the SVG.
  if (isSvg(file)) {
    return {
      file,
      width: 0,
      height: 0,
      bytes: file.size,
      originalWidth: 0,
      originalHeight: 0,
      originalBytes: file.size,
      upscaled: false,
      passedThrough: true,
    };
  }

  const decoded = await decode(file);
  try {
    const srcW = decoded.width;
    const srcH = decoded.height;
    const region = crop
      ? clampCrop(crop, srcW, srcH)
      : coverCropToRegion(srcW, srcH, spec.width, spec.height);

    const canvas = document.createElement("canvas");
    canvas.width = spec.width;
    canvas.height = spec.height;
    const ctx = canvas.getContext("2d", { alpha: spec.alpha });
    if (!ctx) throw new Error("Canvas 2D context unavailable.");

    if (!spec.alpha) {
      ctx.fillStyle = spec.background ?? "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    decoded.draw(
      ctx,
      region.sx,
      region.sy,
      region.sw,
      region.sh,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const blob = await canvasToBlob(
      canvas,
      spec.outputType,
      spec.outputType === "image/jpeg" ? JPEG_QUALITY : 1.0,
    );
    const out = new File([blob], buildOutputName(file.name, spec.outputExt), {
      type: spec.outputType,
      lastModified: Date.now(),
    });

    return {
      file: out,
      width: spec.width,
      height: spec.height,
      bytes: out.size,
      originalWidth: srcW,
      originalHeight: srcH,
      originalBytes: file.size,
      upscaled: region.sw < spec.width || region.sh < spec.height,
      passedThrough: false,
    };
  } finally {
    decoded.release();
  }
}

function coverCropToRegion(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  return coverCrop(srcW, srcH, dstW, dstH);
}

function clampCrop(
  crop: CropPixels,
  srcW: number,
  srcH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const sx = Math.max(0, Math.min(Math.round(crop.x), Math.max(0, srcW - 1)));
  const sy = Math.max(0, Math.min(Math.round(crop.y), Math.max(0, srcH - 1)));
  const sw = Math.max(1, Math.min(Math.round(crop.width), srcW - sx));
  const sh = Math.max(1, Math.min(Math.round(crop.height), srcH - sy));
  return { sx, sy, sw, sh };
}

/**
 * Render a user-selected crop rectangle into a fixed-size output (target).
 * Use this from <ImageCropDialog>'s onConfirm handler.
 */
export function cropAndExport(
  file: File,
  crop: CropPixels,
  target: CropTarget,
): Promise<ResizeResult> {
  return rasterise(file, targetSpec(target), crop);
}

/** Auto cover-crop a source to OG dimensions (no UI). */
export function resizeForOg(file: File): Promise<ResizeResult> {
  return rasterise(file, targetSpec({ kind: "og" }), null);
}

/** Auto cover-crop a source to Logo dimensions (no UI). */
export function resizeForLogo(file: File): Promise<ResizeResult> {
  return rasterise(file, targetSpec({ kind: "logo" }), null);
}

/** Pretty-print a byte count (e.g. 412345 → "402 KB"). */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const n = bytes / Math.pow(1024, i);
  return `${n >= 10 || i === 0 ? Math.round(n) : n.toFixed(1)} ${units[i]}`;
}
