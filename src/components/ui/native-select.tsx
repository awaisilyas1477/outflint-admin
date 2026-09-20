import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const triggerClass =
  "peer flex h-10 w-full cursor-pointer appearance-none rounded-lg border border-input bg-background px-3 py-2 pr-10 text-sm shadow-sm transition-[color,box-shadow,border-color] placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/25";

export type NativeSelectProps = React.ComponentPropsWithoutRef<"select"> & {
  /** Classes for the outer wrapper (e.g. width constraints). */
  containerClassName?: string;
};

/**
 * Styled native &lt;select&gt; with chevron — matches Input focus rings and height.
 */
export const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, containerClassName, disabled, children, ...props }, ref) => {
    return (
      <div
        className={cn(
          "relative w-full min-w-0",
          containerClassName,
          disabled && "pointer-events-none opacity-60",
        )}
      >
        <select ref={ref} className={cn(triggerClass, "w-full", className)} disabled={disabled} {...props}>
          {children}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground opacity-70"
          aria-hidden
        />
      </div>
    );
  },
);
NativeSelect.displayName = "NativeSelect";
