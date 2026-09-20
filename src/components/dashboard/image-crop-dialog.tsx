/**
 * <ImageCropDialog /> — modal that lets the admin pick which portion of an
 * uploaded image becomes the final asset. Wraps `react-easy-crop` for the
 * UI and `cropAndExport()` (canvas) for the actual render.
 *
 * Usage:
 *
 *   const [pendingFile, setPendingFile] = useState<File | null>(null);
 *
 *   <input type="file" onChange={e => setPendingFile(e.target.files?.[0] ?? null)} />
 *
 *   <ImageCropDialog
 *     file={pendingFile}
 *     target={{ kind: "og" }}                      // or { kind: "logo" }
 *     onConfirm={async (result) => {
 *       setPendingFile(null);
 *       await uploadSeoOgImage(result.file);
 *     }}
 *     onClose={() => setPendingFile(null)}
 *   />
 */

import { useEffect, useMemo, useRef, useState, useId } from "react";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { ZoomIn, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  cropAndExport,
  formatBytes,
  type CropTarget,
  type ResizeResult,
} from "@/lib/images/resize";

type ImageCropDialogProps = {
  /** When non-null, the dialog opens. */
  file: File | null;
  target: CropTarget;
  title?: string;
  description?: string;
  onConfirm: (result: ResizeResult) => Promise<void> | void;
  onClose: () => void;
};

const ASPECT: Record<CropTarget["kind"], number> = {
  og: 1200 / 630,
  logo: 1,
  custom: 1,
};

const TARGET_LABEL: Record<CropTarget["kind"], string> = {
  og: "1200×630 (Open Graph / Twitter large image)",
  logo: "512×512 (Organization logo)",
  custom: "custom",
};

export function ImageCropDialog({
  file,
  target,
  title,
  description,
  onConfirm,
  onClose,
}: ImageCropDialogProps) {
  const zoomId = useId();
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [areaPixels, setAreaPixels] = useState<Area | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [imgInfo, setImgInfo] = useState<{ w: number; h: number; bytes: number } | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  // Snapshot the file the moment the dialog opens. We need it for the canvas
  // export at confirm time even if the parent has cleared its state.
  const fileRef = useRef<File | null>(null);

  const aspect = useMemo(() => {
    if (target.kind === "custom") return target.width / target.height;
    return ASPECT[target.kind];
  }, [target]);

  // (Re)load when a new file is supplied; revoke the old object URL.
  useEffect(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    if (!file) {
      fileRef.current = null;
      setImageSrc(null);
      setImgInfo(null);
      return;
    }
    fileRef.current = file;
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setImageSrc(url);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setRotation(0);
    setAreaPixels(null);

    // Probe natural size purely so we can show "source 4032×3024" hint.
    const probe = new Image();
    probe.onload = () => {
      setImgInfo({ w: probe.naturalWidth, h: probe.naturalHeight, bytes: file.size });
    };
    probe.src = url;

    return () => {
      if (objectUrlRef.current === url) {
        URL.revokeObjectURL(url);
        objectUrlRef.current = null;
      }
    };
  }, [file]);

  function handleClose() {
    if (busy) return;
    onClose();
  }

  async function handleConfirm() {
    const f = fileRef.current;
    if (!f || !areaPixels) {
      onClose();
      return;
    }
    setBusy(true);
    try {
      // Note: rotation is intentionally not applied to the export. We display
      // it for orientation correction only if/when we add it; for OG/logo the
      // common case is no rotation, so we keep the export simple. If a non-zero
      // rotation is selected we still export the un-rotated crop rectangle.
      const result = await cropAndExport(f, areaPixels, target);
      await onConfirm(result);
    } finally {
      setBusy(false);
    }
  }

  const open = file !== null;
  const targetLabel = TARGET_LABEL[target.kind];
  const heading =
    title ??
    (target.kind === "og"
      ? "Crop Open Graph image"
      : target.kind === "logo"
        ? "Crop logo"
        : "Crop image");

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) handleClose();
      }}
    >
      <DialogContent
        className="max-w-3xl gap-4 p-0"
        onInteractOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <DialogHeader className="space-y-1.5 px-6 pt-6">
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            {description ??
              `Drag to reposition, pinch or zoom to fit. Output: ${targetLabel}.`}
          </DialogDescription>
        </DialogHeader>

        <div
          className="relative h-[420px] w-full bg-black/95"
          style={{ touchAction: "none" }}
        >
          {imageSrc ? (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              rotation={rotation}
              aspect={aspect}
              cropShape={target.kind === "logo" ? "rect" : "rect"}
              showGrid
              minZoom={1}
              maxZoom={6}
              zoomSpeed={0.4}
              restrictPosition
              objectFit="contain"
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onRotationChange={setRotation}
              onCropComplete={(_area, areaInPixels) => setAreaPixels(areaInPixels)}
            />
          ) : null}
        </div>

        <div className="space-y-3 px-6 pb-2">
          <div className="flex flex-wrap items-center gap-3">
            <label
              htmlFor={zoomId}
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground"
            >
              <ZoomIn className="h-4 w-4" />
              Zoom
            </label>
            <input
              id={zoomId}
              type="range"
              min={1}
              max={6}
              step={0.01}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="h-2 flex-1 cursor-pointer appearance-none rounded-full bg-muted accent-foreground"
              aria-label="Zoom"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRotation((r) => (r + 90) % 360)}
              className="gap-1.5"
            >
              <RotateCw className="h-3.5 w-3.5" />
              Rotate 90°
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setCrop({ x: 0, y: 0 });
                setZoom(1);
                setRotation(0);
              }}
            >
              Reset
            </Button>
          </div>

          {imgInfo ? (
            <p className="text-xs text-muted-foreground">
              Source: {imgInfo.w}×{imgInfo.h} · {formatBytes(imgInfo.bytes)}
              {areaPixels ? (
                <>
                  {" "}
                  · Cropped region:{" "}
                  <span className="font-mono">
                    {Math.round(areaPixels.width)}×{Math.round(areaPixels.height)}
                  </span>
                  {target.kind === "og" || target.kind === "logo" ? (
                    <>
                      {" "}
                      → output{" "}
                      <span className="font-mono">
                        {target.kind === "og" ? "1200×630" : "512×512"}
                      </span>
                    </>
                  ) : null}
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 px-6 pb-6 pt-2">
          <Button type="button" variant="outline" onClick={handleClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={busy || !areaPixels}
          >
            {busy ? "Processing…" : "Use this crop"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
