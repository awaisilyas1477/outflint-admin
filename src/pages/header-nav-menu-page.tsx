import { useEffect, useId, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { AdminStandardDialogContent } from "@/components/ui/admin-standard-dialog";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";
import { fetchCollections } from "@/lib/supabase/catalog";
import type { CollectionRow } from "@/lib/supabase/catalog-types";
import {
  fetchHeaderNavMenuItemsAdmin,
  insertHeaderNavMenuItem,
  updateHeaderNavMenuItem,
  deleteHeaderNavMenuItem,
  type HeaderNavMenuItemRow,
} from "@/lib/supabase/header-nav-menu";
import { revalidateStorefront } from "@/lib/seo/revalidate";
import {
  ADMIN_LIST_PAGE_CLASS,
  TableContainer,
  ADMIN_LIST_CARD_CLASS,
  ADMIN_LIST_CARD_HEADER_CLASS,
  ADMIN_LIST_CARD_CONTENT_CLASS,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW,
  adminTh,
  adminThEnd,
  adminTd,
  AdminListSkeleton,
} from "@/components/dashboard/admin-list-shell";
import { cn } from "@/lib/utils";

type FormState = {
  name: string;
  label: string;
  collection_id: string;
  sort_order: string;
  is_active: boolean;
};

const emptyForm = (): FormState => ({
  name: "",
  label: "",
  collection_id: "",
  sort_order: "0",
  is_active: true,
});

export function HeaderNavMenuPage() {
  const nameId = useId();
  const labelId = useId();
  const collectionId = useId();
  const sortId = useId();
  const activeId = useId();

  const [rows, setRows] = useState<HeaderNavMenuItemRow[]>([]);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HeaderNavMenuItemRow | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HeaderNavMenuItemRow | null>(null);

  async function load() {
    if (!supabase) {
      toast.error("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [navRows, cols] = await Promise.all([
        fetchHeaderNavMenuItemsAdmin(),
        fetchCollections(),
      ]);
      setRows(navRows);
      setCollections(cols);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, []);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm());
    setDialogOpen(true);
  }

  function openEdit(row: HeaderNavMenuItemRow) {
    setEditing(row);
    setForm({
      name: row.name,
      label: row.label,
      collection_id: row.collection_id,
      sort_order: String(row.sort_order),
      is_active: row.is_active,
    });
    setDialogOpen(true);
  }

  const takenCollectionIds = new Set(
    rows.filter((r) => (editing ? r.id !== editing.id : true)).map((r) => r.collection_id),
  );

  const collectionOptions = collections.filter(
    (c) => !takenCollectionIds.has(c.id) || c.id === form.collection_id,
  );

  const selectedCollection = collections.find((c) => c.id === form.collection_id);

  async function onSubmitDialog(e: React.FormEvent) {
    e.preventDefault();
    if (!form.collection_id) {
      toast.error("Choose a collection. Items without a collection cannot be saved.");
      return;
    }
    const name = form.name.trim();
    const label = form.label.trim();
    if (!name || !label) {
      toast.error("Name and label are required.");
      return;
    }
    const sort = parseInt(form.sort_order, 10);
    if (!Number.isFinite(sort)) {
      toast.error("Sort order must be a number.");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const res = await updateHeaderNavMenuItem(editing.id, {
          name,
          label,
          collection_id: form.collection_id,
          sort_order: sort,
          is_active: form.is_active,
        });
        if (!res.ok) {
          toast.error(res.error ?? "Update failed.");
          return;
        }
        toast.success("Menu item updated.");
      } else {
        const res = await insertHeaderNavMenuItem({
          name,
          label,
          collection_id: form.collection_id,
          sort_order: sort,
          is_active: form.is_active,
        });
        if (!res.ok) {
          toast.error(res.error ?? "Could not create item.");
          return;
        }
        toast.success("Menu item created.");
      }
      setDialogOpen(false);
      await load();
      // Bust the storefront's header-nav-menu cache so the new menu item
      // appears in the live header right away.
      void revalidateStorefront({ all: true });
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await deleteHeaderNavMenuItem(deleteTarget.id);
      if (!res.ok) {
        toast.error(res.error ?? "Delete failed.");
        return;
      }
      toast.success("Removed from header menu.");
      setDeleteTarget(null);
      await load();
      void revalidateStorefront({ all: true });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Header menu"
        description="Manage promotional links shown next to All Categories in the storefront header."
        actions={
          <Button type="button" size="sm" onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Add menu item
          </Button>
        }
      />

      <div className={cn(ADMIN_LIST_CARD_CLASS)}>
        <div className={ADMIN_LIST_CARD_HEADER_CLASS}>
          <h2 className="text-lg font-semibold tracking-tight">Configured links</h2>
          <p className="text-sm text-muted-foreground">
            Inactive items are hidden on the live site. Only one menu row per collection is allowed.
          </p>
        </div>
        <div className={ADMIN_LIST_CARD_CONTENT_CLASS}>
          {loading ? (
            <AdminListSkeleton />
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No items yet. Add a menu entry and assign a collection — links cannot be saved without it.
            </p>
          ) : (
            <TableContainer>
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className={ADMIN_TABLE_HEAD}>
                    <th className={adminTh()}>Name</th>
                    <th className={adminTh()}>Label</th>
                    <th className={adminTh()}>Slug</th>
                    <th className={adminTh()}>Sort</th>
                    <th className={adminTh()}>Active</th>
                    <th className={adminThEnd()}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={ADMIN_TABLE_ROW}>
                      <td className={adminTd()}>{row.name}</td>
                      <td className={adminTd()}>{row.label}</td>
                      <td className={adminTd("font-mono text-xs")}>{row.slug}</td>
                      <td className={adminTd("tabular-nums")}>{row.sort_order}</td>
                      <td className={adminTd()}>
                        {row.is_active ? (
                          <Badge>Active</Badge>
                        ) : (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </td>
                      <td className={adminTd()}>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openEdit(row)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            Edit
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(row)}
                          >
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableContainer>
          )}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AdminStandardDialogContent
          className="max-w-md"
          title={editing ? "Edit menu item" : "Add menu item"}
          subtitle={
            <>
              Pick a collection — the storefront link becomes{" "}
              <code className="rounded bg-muted px-1 py-0.5 text-xs">/collections/…</code> using that
              collection&apos;s slug.
            </>
          }
          footer={
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" form="header-nav-item-form" disabled={saving || !form.collection_id}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          }
        >
          <form id="header-nav-item-form" onSubmit={onSubmitDialog} className="grid gap-4">
              <div className="space-y-2">
                <Label htmlFor={nameId}>Name (internal)</Label>
                <Input
                  id={nameId}
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Sale promo"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={labelId}>Label (visible in nav)</Label>
                <Input
                  id={labelId}
                  value={form.label}
                  onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                  placeholder="e.g. Sale or 🔥 Bundle Deals"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={collectionId}>Collection (required)</Label>
                <NativeSelect
                  id={collectionId}
                  value={form.collection_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, collection_id: e.target.value }))
                  }
                  required
                >
                  <option value="">Select a collection…</option>
                  {collectionOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.slug})
                    </option>
                  ))}
                </NativeSelect>
                {selectedCollection ? (
                  <p className="text-xs text-muted-foreground">
                    Slug on save:{" "}
                    <span className="font-mono">{selectedCollection.slug}</span> →{" "}
                    <span className="font-mono">/collections/{selectedCollection.slug}</span>
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor={sortId}>Sort order</Label>
                <Input
                  id={sortId}
                  type="number"
                  inputMode="numeric"
                  value={form.sort_order}
                  onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
                />
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id={activeId}
                  checked={form.is_active}
                  onCheckedChange={(c) =>
                    setForm((f) => ({ ...f, is_active: c === true }))
                  }
                />
                <Label htmlFor={activeId} className="font-normal">
                  Active on storefront
                </Label>
              </div>
          </form>
        </AdminStandardDialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AdminStandardDialogContent
          title="Remove menu item?"
          subtitle="This only removes the header link — the collection itself is unchanged."
          footer={
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={saving}
                onClick={() => void confirmDelete()}
              >
                {saving ? "Removing…" : "Remove"}
              </Button>
            </DialogFooter>
          }
        />
      </Dialog>
    </div>
  );
}
