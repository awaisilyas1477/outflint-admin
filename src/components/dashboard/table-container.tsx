/* eslint-disable react-refresh/only-export-components -- table primitives + small helper fns live with TableContainer */
import { cn } from "@/lib/utils";

/** Horizontal scroll + rounded shell for data tables inside cards */
export function TableContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/60 bg-muted/10",
        className,
      )}
    >
      <div className="overflow-x-auto">{children}</div>
    </div>
  );
}

/** Sticky-style header row */
export const ADMIN_TABLE_HEAD =
  "border-b border-border/70 bg-muted/40 text-left text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-muted-foreground dark:bg-muted/20";

/** Body row: zebra-friendly hover */
export const ADMIN_TABLE_ROW =
  "border-b border-border/40 transition-colors last:border-b-0 odd:bg-transparent even:bg-muted/[0.12] hover:bg-primary/[0.04] dark:even:bg-muted/[0.06] dark:hover:bg-primary/[0.06]";

/** Cell padding — 8px grid (12px = 1.5, 16px = 4) */
export const ADMIN_TABLE_CELL = "px-4 py-3 align-middle";

/** Table header cell with standard right gutter (not last column). */
export function adminTh(className?: string) {
  return cn(ADMIN_TABLE_CELL, "pr-6", className);
}

/** Last header column (no extra pr). */
export function adminThEnd(className?: string) {
  return cn(ADMIN_TABLE_CELL, className);
}

/** Body cell — pass Tailwind overrides (e.g. px-2) and they merge correctly. */
export function adminTd(className?: string) {
  return cn(ADMIN_TABLE_CELL, className);
}
