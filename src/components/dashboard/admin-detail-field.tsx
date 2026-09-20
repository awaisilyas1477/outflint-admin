import { cn } from "@/lib/utils";

export function AdminDetailGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}>{children}</div>
  );
}

export function AdminDetailField({
  label,
  children,
  className,
  span = 1,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
  span?: 1 | 2 | 3;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-border/60 bg-muted/20 px-4 py-3 dark:bg-muted/10",
        span === 2 && "sm:col-span-2",
        span === 3 && "sm:col-span-2 lg:col-span-3",
        className,
      )}
    >
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <div className="mt-1.5 text-sm font-medium text-foreground">{children}</div>
    </div>
  );
}
