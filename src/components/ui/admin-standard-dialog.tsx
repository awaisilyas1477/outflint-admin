import * as React from "react";
import {
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type AdminStandardDialogContentProps = Omit<
  React.ComponentProps<typeof DialogContent>,
  "children"
> & {
  title: string;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  /** Typically `<DialogFooter>…</DialogFooter>` with action buttons only. */
  footer: React.ReactNode;
};

/**
 * Fixed header (title + subtitle), scrollable body, fixed footer — aligned with the storefront
 * `ModalShell` pattern.
 */
export function AdminStandardDialogContent({
  title,
  subtitle,
  children,
  footer,
  className,
  ...props
}: AdminStandardDialogContentProps) {
  return (
    <DialogContent
      className={cn(
        "flex max-h-[min(90vh,880px)] flex-col gap-0 p-0 sm:max-w-lg",
        className,
      )}
      {...props}
    >
      <div className="shrink-0 border-b px-6 pb-4 pt-6 pr-14">
        <DialogHeader className="space-y-1.5 text-left sm:text-left">
          <DialogTitle>{title}</DialogTitle>
          {subtitle != null && subtitle !== "" ? (
            <DialogDescription className="text-muted-foreground">{subtitle}</DialogDescription>
          ) : null}
        </DialogHeader>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-4">
        {children}
      </div>
      <div className="shrink-0 border-t bg-muted/40 px-6 py-4">{footer}</div>
    </DialogContent>
  );
}
