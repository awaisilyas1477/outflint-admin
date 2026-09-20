import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { AdminStandardDialogContent } from "@/components/ui/admin-standard-dialog";
import { Button } from "@/components/ui/button";

type AdminConfirmDeleteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  subtitle?: React.ReactNode;
  confirmLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
};

export function AdminConfirmDeleteDialog({
  open,
  onOpenChange,
  title,
  subtitle,
  confirmLabel = "Delete permanently",
  busy = false,
  onConfirm,
}: AdminConfirmDeleteDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <AdminStandardDialogContent
        title={title}
        subtitle={subtitle ?? "This action cannot be undone."}
        footer={
          <DialogFooter className="gap-2 sm:justify-end">
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={busy}
              onClick={() => void onConfirm()}
            >
              {busy ? "Deleting…" : confirmLabel}
            </Button>
          </DialogFooter>
        }
      />
    </Dialog>
  );
}
