import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Package, Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/dashboard/page-header";
import { toast } from "sonner";
import { EmptyState } from "@/components/dashboard/empty-state";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import {
  AdminListCard,
  AdminListSkeleton,
  ADMIN_LIST_PAGE_CLASS,
  TableContainer,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW,
  adminTh,
  adminThEnd,
  adminTd,
  AdminRowEditLink,
} from "@/components/dashboard/admin-list-shell";
import {
  bulkAddTagToProductsAdmin,
  bulkUpdateProductStatusAdmin,
  fetchProductsWithVariantCount,
  fetchTags,
  type ProductCatalogTagRef,
} from "@/lib/supabase/catalog";
import type { ProductRow } from "@/lib/supabase/catalog-types";
import { firstProductImageUrl } from "@/lib/product-image";
import { supabase } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";

type Row = ProductRow & { variant_count: number; catalog_tags: ProductCatalogTagRef[] };

export function ProductsListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagId, setBulkTagId] = useState("");
  const [allTags, setAllTags] = useState<Awaited<ReturnType<typeof fetchTags>>>([]);
  const [bulkBusy, setBulkBusy] = useState(false);

  const initialTag = searchParams.get("tag") || "";
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState(initialTag);
  const [selectedStatus, setSelectedStatus] = useState<"all" | "active" | "draft">("all");

  useEffect(() => {
    const urlTag = searchParams.get("tag");
    if (urlTag !== null) {
      setSelectedTag(urlTag);
    }
  }, [searchParams]);

  async function load() {
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchProductsWithVariantCount();
      setRows(data as Row[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load products.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(() => {
      void load();
      void fetchTags().then(setAllTags);
    });
  }, []);

  const allAvailableTags = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of rows) {
      for (const t of p.catalog_tags) {
        map.set(t.label.toLowerCase(), t.label);
      }
    }
    return Array.from(map.entries())
      .map(([slug, label]) => ({ slug, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((p) => {
      if (selectedStatus !== "all" && p.status !== selectedStatus) {
        return false;
      }
      if (selectedTag) {
        const target = selectedTag.toLowerCase().trim();
        const hasTag = p.catalog_tags.some((t) => {
          const l = t.label.toLowerCase().trim();
          const legacyName = t.id.replace(/^legacy:/, "").toLowerCase().trim();
          return l === target || legacyName === target;
        });
        if (!hasTag) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesSlug = (p.slug || "").toLowerCase().includes(q);
        const matchesShort = (p.short_description || "").toLowerCase().includes(q);
        const matchesDesc = (p.description || "").toLowerCase().includes(q);
        const matchesKeywords = (p.search_keywords || "").toLowerCase().includes(q);
        if (!matchesName && !matchesSlug && !matchesShort && !matchesDesc && !matchesKeywords) {
          return false;
        }
      }
      return true;
    });
  }, [rows, selectedStatus, selectedTag, searchQuery]);

  function handleTagSelect(tagLabel: string) {
    setSelectedTag(tagLabel);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (tagLabel) {
        next.set("tag", tagLabel);
      } else {
        next.delete("tag");
      }
      return next;
    });
  }

  function clearAllFilters() {
    setSearchQuery("");
    setSelectedTag("");
    setSelectedStatus("all");
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("tag");
      return next;
    });
  }

  const isFiltered = Boolean(searchQuery.trim() || selectedTag || selectedStatus !== "all");

  const allFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((p) => selectedIds.has(p.id));

  function toggleSelectAll() {
    if (allFilteredSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredRows.map((p) => p.id)));
    }
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function runBulkStatus(status: "active" | "draft") {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const res = await bulkUpdateProductStatusAdmin(ids, status);
    setBulkBusy(false);
    if (res.ok === 0) {
      toast.error("Bulk update failed.");
      return;
    }
    toast.success(`Updated ${res.ok} product${res.ok === 1 ? "" : "s"} to ${status}.`);
    setSelectedIds(new Set());
    await load();
  }

  async function runBulkAddTag() {
    const ids = Array.from(selectedIds);
    if (ids.length === 0 || !bulkTagId) {
      toast.error("Select products and a tag.");
      return;
    }
    setBulkBusy(true);
    const res = await bulkAddTagToProductsAdmin(ids, bulkTagId);
    setBulkBusy(false);
    if (res.ok === 0) {
      toast.error("Bulk tag add failed.");
      return;
    }
    toast.success(`Tagged ${res.ok} product${res.ok === 1 ? "" : "s"}.`);
    setSelectedIds(new Set());
    await load();
  }

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Products"
        description="Parent listings and sellable SKUs: each product can have variants (size, color, etc.) with their own price and stock."
        actions={
          <Button type="button" size="sm" asChild>
            <Link to="/dashboard/products/new">
              <Plus className="mr-2 h-4 w-4" />
              Add product
            </Link>
          </Button>
        }
      />

      <AdminListCard
        title="Catalog"
        description="Manage listings and variant counts. Open a row to edit details, media, and SKUs."
      >
        {loading ? (
          <AdminListSkeleton />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Package}
            title="No products yet"
            description="Create your first listing to appear on the storefront. You can add variants, images, and inventory in the editor."
          >
            <Button size="sm" asChild>
              <Link to="/dashboard/products/new">
                <Plus className="mr-2 h-4 w-4" />
                Add product
              </Link>
            </Button>
          </EmptyState>
            ) : (
              <div className="space-y-4">
                {selectedIds.size > 0 ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                    <span className="text-sm font-medium">{selectedIds.size} selected</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={bulkBusy}
                      onClick={() => void runBulkStatus("active")}
                    >
                      Set active
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={bulkBusy}
                      onClick={() => void runBulkStatus("draft")}
                    >
                      Set draft
                    </Button>
                    <NativeSelect
                      value={bulkTagId}
                      onChange={(e) => setBulkTagId(e.target.value)}
                      className="h-8 w-40 text-xs"
                      aria-label="Tag to add"
                    >
                      <option value="">Add tag…</option>
                      {allTags.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </NativeSelect>
                    <Button
                      type="button"
                      size="sm"
                      disabled={bulkBusy || !bulkTagId}
                      onClick={() => void runBulkAddTag()}
                    >
                      Apply tag
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => setSelectedIds(new Set())}
                    >
                      Clear
                    </Button>
                  </div>
                ) : null}

                {/* Filter Toolbar */}
            <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-muted/20 p-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-1 flex-wrap items-center gap-2.5">
                <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by title, description, slug, or keywords…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-9 pl-9 text-sm"
                  />
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>

                <div className="w-full sm:w-48">
                  <NativeSelect
                    value={selectedTag}
                    onChange={(e) => handleTagSelect(e.target.value)}
                    className="h-9 text-sm"
                    aria-label="Filter by tag"
                  >
                    <option value="">All tags ({allAvailableTags.length})</option>
                    {allAvailableTags.map((t) => (
                      <option key={t.slug} value={t.label}>
                        {t.label}
                      </option>
                    ))}
                  </NativeSelect>
                </div>

                <div className="w-full sm:w-36">
                  <NativeSelect
                    value={selectedStatus}
                    onChange={(e) =>
                      setSelectedStatus(e.target.value as "all" | "active" | "draft")
                    }
                    className="h-9 text-sm"
                    aria-label="Filter by status"
                  >
                    <option value="all">All statuses</option>
                    <option value="active">Active only</option>
                    <option value="draft">Drafts only</option>
                  </NativeSelect>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground sm:justify-end">
                <span className="tabular-nums font-medium">
                  Showing {filteredRows.length} of {rows.length}
                </span>
                {isFiltered ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={clearAllFilters}
                    className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10"
                  >
                    <X className="mr-1 h-3.5 w-3.5" />
                    Clear filters
                  </Button>
                ) : null}
              </div>
            </div>

            {filteredRows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border py-12 text-center">
                <p className="text-sm font-medium text-foreground">No matching products found</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Try adjusting your search query or tag filter.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={clearAllFilters}
                  className="mt-4"
                >
                  Clear all filters
                </Button>
              </div>
            ) : (
              <TableContainer>
                <table className="w-full min-w-[880px] text-left text-sm">
                  <thead>
                    <tr className={ADMIN_TABLE_HEAD}>
                      <th className={adminTh("w-10")}>
                        <input
                          type="checkbox"
                          checked={allFilteredSelected}
                          onChange={toggleSelectAll}
                          aria-label="Select all on page"
                          className="h-4 w-4 rounded border-border"
                        />
                      </th>
                      <th className={adminTh("w-14")}>Image</th>
                      <th className={adminTh()}>Name</th>
                      <th className={adminTh()}>Slug</th>
                      <th className={adminTh()}>Status</th>
                      <th className={adminTh()}>Tags</th>
                      <th className={adminTh()}>Variants</th>
                      <th className={adminThEnd()} />
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((p) => {
                      const thumb = firstProductImageUrl(p.images);
                      return (
                      <tr key={p.id} className={ADMIN_TABLE_ROW}>
                        <td className={adminTd()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(p.id)}
                            onChange={() => toggleSelect(p.id)}
                            aria-label={`Select ${p.name}`}
                            className="h-4 w-4 rounded border-border"
                          />
                        </td>
                        <td className={adminTd()}>
                          <div className="h-11 w-11 overflow-hidden rounded-md border border-border/60 bg-muted/40">
                            {thumb ? (
                              <img
                                src={thumb}
                                alt=""
                                className="h-full w-full object-cover"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                —
                              </div>
                            )}
                          </div>
                        </td>
                        <td className={adminTd("font-medium text-foreground")}>{p.name}</td>

                        <td className={adminTd("font-mono text-xs text-muted-foreground")}>
                          {p.slug}
                        </td>
                        <td className={adminTd()}>
                          <Badge
                            variant={p.status === "active" ? "success" : "secondary"}
                            className="font-medium capitalize"
                          >
                            {p.status}
                          </Badge>
                        </td>
                        <td className={adminTd("max-w-[min(280px,32vw)] align-top")}>
                          {p.catalog_tags.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {p.catalog_tags.map((t) => {
                                const isCurrentFilter =
                                  selectedTag.toLowerCase() === t.label.toLowerCase();
                                return (
                                  <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => handleTagSelect(t.label)}
                                    className="cursor-pointer transition hover:opacity-80"
                                    title={`Filter by tag "${t.label}"`}
                                  >
                                    <Badge
                                      variant={isCurrentFilter ? "default" : "outline"}
                                      className="max-w-44 truncate font-normal"
                                    >
                                      {t.label}
                                    </Badge>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </td>
                        <td className={adminTd("tabular-nums text-muted-foreground")}>
                          {p.variant_count}
                        </td>
                        <td className={cn(adminTd(), "text-right")}>
                          <AdminRowEditLink to={`/dashboard/products/${p.id}`} />
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
              </TableContainer>
            )}
          </div>
        )}
      </AdminListCard>
    </div>
  );
}
