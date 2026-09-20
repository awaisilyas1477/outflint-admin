import { cn } from "@/lib/utils";

/**
 * Visual section inside long forms — labels above fields, optional helper copy.
 */
export function FieldGroup({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-xl border border-border/60 bg-card p-5", className)}>
      <div className="space-y-1.5">
        <h3 className="text-sm font-semibold tracking-tight text-foreground">{title}</h3>
        {description ? (
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="mt-5 space-y-4">{children}</div>
    </div>
  );
}
