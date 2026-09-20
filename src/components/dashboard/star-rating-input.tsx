import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

export type StarRatingInputProps = {
  count?: number;
  value?: number;
  size?: number;
  /** Inactive / outline star stroke color. */
  color?: string;
  /** Filled / active star color. */
  activeColor?: string;
  isHalf?: boolean;
  edit?: boolean;
  classNames?: string;
  onChange?: (newRating: number) => void;
};

/**
 * Half-step rating (0–5 in 0.5 steps). Uses Lucide icons so stars always render
 * (no dependency on legacy float/unicode layout that can collapse in Tailwind flex).
 */
export function StarRatingInput({
  count = 5,
  value = 0,
  size = 28,
  color = "#94a3b8",
  activeColor = "#eab308",
  isHalf = true,
  edit = true,
  classNames,
  onChange = () => {},
}: StarRatingInputProps) {
  const max = count;
  const v = Math.min(
    max,
    Math.max(0, Math.round((value ?? 0) * 2) / 2),
  );

  function apply(next: number) {
    const clamped = Math.min(max, Math.max(0, Math.round(next * 2) / 2));
    if (clamped !== v) onChange(clamped);
  }

  return (
    <div
      className={cn("inline-flex items-center gap-0.5", classNames)}
      role={edit ? "group" : undefined}
      aria-label="Product rating"
    >
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className="relative inline-flex shrink-0"
          style={{ width: size, height: size }}
        >
          {/* Base outline */}
          <Star
            size={size}
            stroke={color}
            fill="none"
            strokeWidth={1.75}
            className="pointer-events-none shrink-0"
            aria-hidden
          />

          {/* Full star */}
          {v >= i + 1 ? (
            <Star
              size={size}
              fill={activeColor}
              stroke={activeColor}
              strokeWidth={1.75}
              className="pointer-events-none absolute left-0 top-0 shrink-0"
              aria-hidden
            />
          ) : null}

          {/* Half star */}
          {isHalf && v >= i + 0.5 && v < i + 1 ? (
            <span
              className="pointer-events-none absolute left-0 top-0 overflow-hidden"
              style={{ width: size / 2, height: size }}
            >
              <Star
                size={size}
                fill={activeColor}
                stroke={activeColor}
                strokeWidth={1.75}
                aria-hidden
              />
            </span>
          ) : null}

          {edit ? (
            isHalf ? (
              <>
                <button
                  type="button"
                  tabIndex={0}
                  className="absolute inset-y-0 left-0 z-10 w-1/2 cursor-pointer bg-transparent"
                  onClick={() => apply(i + 0.5)}
                  aria-label={`Set rating to ${i + 0.5} out of ${max}`}
                />
                <button
                  type="button"
                  tabIndex={0}
                  className="absolute inset-y-0 right-0 z-10 w-1/2 cursor-pointer bg-transparent"
                  onClick={() => apply(i + 1)}
                  aria-label={`Set rating to ${i + 1} out of ${max}`}
                />
              </>
            ) : (
              <button
                type="button"
                tabIndex={0}
                className="absolute inset-0 z-10 cursor-pointer bg-transparent"
                onClick={() => apply(i + 1)}
                aria-label={`Set rating to ${i + 1} out of ${max}`}
              />
            )
          ) : null}
        </span>
      ))}
    </div>
  );
}
