import { useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import { Loader2, X } from "lucide-react";
import ReactStarsImport from "react-rating-stars-component";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { AdminStandardDialogContent } from "@/components/ui/admin-standard-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AdminSearchField } from "@/components/dashboard/admin-search-field";
import {
  REVIEW_MAX_FILES,
  validateReviewFiles,
  type ValidatedReviewFile,
} from "@/lib/review-upload-rules";
import { supabase } from "@/lib/supabase/client";
import { uploadReviewMediaForReviewRow } from "@/lib/supabase/storage-config";
import { fetchCustomersAdminPaginated, type PublicUserRow } from "@/lib/supabase/customers";
import {
  createReviewAsAdmin,
  fetchProductPicklistAdmin,
  type ProductPicklistRow,
  type ReviewModerationStatus,
} from "@/lib/supabase/reviews-admin";
import { revalidateStorefrontAfterReviewsChange } from "@/lib/revalidate-after-reviews";
import { requestReviewThankYouVoucher } from "@/lib/review-thank-you-voucher";
import { cn } from "@/lib/utils";

const FORM_ID = "admin-review-compose-form";
const MEDIA_INPUT_ID = "admin-review-media-input";

const selectClass =
  "flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40";

/** `react-rating-stars-component` is CJS; Vite may wrap the component as `{ default: fn }` (sometimes nested). */
function unwrapRatingStarsComponent(
  mod: typeof ReactStarsImport,
): ComponentType<{
  count?: number;
  value?: number;
  size?: number;
  activeColor?: string;
  edit?: boolean;
  onChange?: (newRating: number) => void;
}> {
  let x: unknown = mod;
  for (let i = 0; i < 3; i++) {
    if (typeof x === "function") return x as ComponentType<Record<string, unknown>>;
    if (x && typeof x === "object" && "default" in x) {
      x = (x as { default: unknown }).default;
    } else break;
  }
  return x as ComponentType<Record<string, unknown>>;
}

const ReactStars = unwrapRatingStarsComponent(ReactStarsImport);

function displayCustomer(u: PublicUserRow): string {
  const n = `${u.first_name} ${u.last_name}`.trim();
  const tail = u.phone?.trim() ? ` · ${u.phone}` : "";
  return (n || "Customer") + tail;
}

type AuthorMode = "registered" | "display_only";

type PendingAttachment = {
  id: string;
  file: File;
  kind: "image" | "video";
  previewUrl: string;
};

function newAttachmentId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
};

export function ReviewComposeAdminDialog({ open, onOpenChange, onCreated }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [products, setProducts] = useState<ProductPicklistRow[]>([]);
  const [customerResults, setCustomerResults] = useState<PublicUserRow[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerSearchDebounced, setCustomerSearchDebounced] = useState("");
  const [searchingCustomers, setSearchingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<PublicUserRow | null>(null);
  const [loadingPicklists, setLoadingPicklists] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [authorMode, setAuthorMode] = useState<AuthorMode>("registered");
  const [productId, setProductId] = useState("");
  const [userId, setUserId] = useState("");
  const [attributedName, setAttributedName] = useState("");
  const [attributedEmail, setAttributedEmail] = useState("");
  /** 0 = not chosen yet (DB requires 1–5 on submit). */
  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [status, setStatus] = useState<ReviewModerationStatus>("approved");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);

  useEffect(() => {
    if (!open || !supabase) return;
    let cancelled = false;
    queueMicrotask(() => setLoadingPicklists(true));
    void (async () => {
      const prows = await fetchProductPicklistAdmin(800);
      if (cancelled) return;
      setProducts(prows);
      setLoadingPicklists(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    const t = setTimeout(() => setCustomerSearchDebounced(customerSearch), 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  useEffect(() => {
    if (!open || authorMode !== "registered") return;
    let cancelled = false;
    queueMicrotask(() => setSearchingCustomers(true));
    void (async () => {
      const result = await fetchCustomersAdminPaginated({
        page: 1,
        pageSize: 25,
        search: customerSearchDebounced,
      });
      if (cancelled) return;
      setCustomerResults(result.rows);
      setSearchingCustomers(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, authorMode, customerSearchDebounced]);

  useEffect(() => {
    if (!open) return;
    queueMicrotask(() => {
      setAuthorMode("registered");
      setProductId("");
      setUserId("");
      setSelectedCustomer(null);
      setCustomerSearch("");
      setCustomerSearchDebounced("");
      setCustomerResults([]);
      setAttributedName("");
      setAttributedEmail("");
      setRating(0);
      setTitle("");
      setBody("");
      setStatus("approved");
      setPendingAttachments((prev) => {
        prev.forEach((a) => URL.revokeObjectURL(a.previewUrl));
        return [];
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
    });
  }, [open]);

  function removePendingAttachment(id: string) {
    setPendingAttachments((prev) => {
      const found = prev.find((a) => a.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  function onPendingMediaChange(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    const validated = validateReviewFiles(picked);
    if (!validated.ok) {
      for (const err of validated.errors) {
        toast.error(err.fileName ? `${err.fileName}: ${err.message}` : err.message);
      }
      return;
    }
    setPendingAttachments((prev) => {
      const room = REVIEW_MAX_FILES - prev.length;
      if (room <= 0) {
        toast.error(`You can attach at most ${REVIEW_MAX_FILES} files.`);
        return prev;
      }
      const slice = validated.files.slice(0, room);
      if (validated.files.length > room) {
        toast.info(`Only ${room} more file(s) added (max ${REVIEW_MAX_FILES}).`);
      }
      const added: PendingAttachment[] = slice.map((vf: ValidatedReviewFile) => ({
        id: newAttachmentId(),
        file: vf.file,
        kind: vf.kind,
        previewUrl: URL.createObjectURL(vf.file),
      }));
      return [...prev, ...added];
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) {
      toast.error("Choose a product.");
      return;
    }
    if (!title.trim() || !body.trim()) {
      toast.error("Title and review text are required.");
      return;
    }
    if (rating < 1 || rating > 5) {
      toast.error("Select a star rating from 1 to 5.");
      return;
    }
    if (authorMode === "registered") {
      if (!userId) {
        toast.error("Choose a customer, or switch to display-only author.");
        return;
      }
    } else {
      if (!attributedName.trim()) {
        toast.error("Enter a display name for the reviewer.");
        return;
      }
    }

    const validatedFiles: ValidatedReviewFile[] = pendingAttachments.map((a) => ({
      file: a.file,
      kind: a.kind,
    }));

    setSubmitting(true);
    const res =
      authorMode === "registered"
        ? await createReviewAsAdmin({
            product_id: productId,
            user_id: userId,
            rating,
            title,
            body,
            status,
          })
        : await createReviewAsAdmin({
            product_id: productId,
            attributed_display_name: attributedName.trim(),
            attributed_display_email: attributedEmail.trim() || null,
            rating,
            title,
            body,
            status,
          });

    if (!res.ok) {
      setSubmitting(false);
      const msg = res.error ?? "Could not create review.";
      if (/duplicate|unique|23505/i.test(msg)) {
        toast.error("This customer already has a review for that product.", {
          description: "Each account can only review a product once.",
        });
      } else {
        toast.error(msg);
      }
      return;
    }

    const reviewId = res.reviewId;

    if (validatedFiles.length > 0 && supabase) {
      const uploadResult = await uploadReviewMediaForReviewRow(supabase, reviewId, validatedFiles);
      if (!uploadResult.ok) {
        setSubmitting(false);
        toast.error(
          uploadResult.fileName
            ? `Upload failed (${uploadResult.fileName}): ${uploadResult.message}`
            : uploadResult.message,
          {
            description: "Review was saved without attachments. You can delete it and try again.",
          },
        );
        onOpenChange(false);
        onCreated();
        revalidateStorefrontAfterReviewsChange();
        if (status === "approved") {
          requestReviewThankYouVoucher(reviewId);
        }
        return;
      }

      if (uploadResult.media.length > 0) {
        const { error: upRevErr } = await supabase
          .from("reviews")
          .update({
            media: uploadResult.media,
            updated_at: new Date().toISOString(),
          })
          .eq("id", reviewId);
        if (upRevErr) {
          setSubmitting(false);
          toast.error(upRevErr.message);
          onOpenChange(false);
          onCreated();
          revalidateStorefrontAfterReviewsChange();
          if (status === "approved") {
            requestReviewThankYouVoucher(reviewId);
          }
          return;
        }
      }
    }

    setPendingAttachments((prev) => {
      prev.forEach((a) => URL.revokeObjectURL(a.previewUrl));
      return [];
    });
    if (fileInputRef.current) fileInputRef.current.value = "";

    setSubmitting(false);
    toast.success("Review created.");
    onOpenChange(false);
    onCreated();
    revalidateStorefrontAfterReviewsChange();
    if (status === "approved") {
      requestReviewThankYouVoucher(reviewId);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <AdminStandardDialogContent
        title="Add review"
        subtitle="Post as a registered customer or as a display-only name with optional email. Optional photos and videos use the same rules as the storefront."
        footer={
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={FORM_ID}
              disabled={submitting || loadingPicklists}
            >
              {submitting ? "Saving…" : "Create review"}
            </Button>
          </DialogFooter>
        }
      >
        <form id={FORM_ID} onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label>Author</Label>
            <div className="flex rounded-lg border border-input p-1">
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  authorMode === "registered"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setAuthorMode("registered")}
              >
                Registered customer
              </button>
              <button
                type="button"
                className={cn(
                  "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  authorMode === "display_only"
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
                onClick={() => setAuthorMode("display_only")}
              >
                Display only
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              {authorMode === "registered"
                ? "Review is tied to an existing account; duplicate product reviews are blocked."
                : "Name and email are stored on the review only (for display/records)."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="compose-product">Product</Label>
            <select
              id="compose-product"
              required
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className={cn(selectClass, loadingPicklists && "opacity-60")}
              disabled={loadingPicklists}
            >
              <option value="">Select product…</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                  {p.status !== "active" ? ` (${p.status})` : ""}
                </option>
              ))}
            </select>
          </div>

          {authorMode === "registered" ? (
            <div className="space-y-2">
              <Label htmlFor="compose-user-search">Customer (attributed author)</Label>
              {selectedCustomer ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-input bg-muted/20 px-3 py-2 text-sm">
                  <span>{displayCustomer(selectedCustomer)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelectedCustomer(null);
                      setUserId("");
                    }}
                  >
                    Clear
                  </Button>
                </div>
              ) : (
                <>
                  <AdminSearchField
                    value={customerSearch}
                    onChange={setCustomerSearch}
                    placeholder="Search phone or name…"
                    aria-label="Search customers for review author"
                  />
                  <div className="max-h-40 overflow-y-auto rounded-lg border border-border/60">
                    {searchingCustomers ? (
                      <p className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                        Searching…
                      </p>
                    ) : customerResults.length === 0 ? (
                      <p className="px-3 py-2 text-sm text-muted-foreground">
                        {customerSearchDebounced.trim()
                          ? "No customers match."
                          : "Type to search customers."}
                      </p>
                    ) : (
                      <ul className="divide-y divide-border/60">
                        {customerResults.map((u) => (
                          <li key={u.id}>
                            <button
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-muted/40"
                              onClick={() => {
                                setSelectedCustomer(u);
                                setUserId(u.id);
                              }}
                            >
                              {displayCustomer(u)}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="compose-attributed-name">Display name</Label>
                <Input
                  id="compose-attributed-name"
                  value={attributedName}
                  onChange={(e) => setAttributedName(e.target.value)}
                  placeholder="Shown as reviewer name"
                  required
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="compose-attributed-email">Email (optional)</Label>
                <Input
                  id="compose-attributed-email"
                  type="email"
                  value={attributedEmail}
                  onChange={(e) => setAttributedEmail(e.target.value)}
                  placeholder="Optional, for admin list / records only"
                  autoComplete="off"
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label>Rating (1–5)</Label>
            <div className="flex flex-wrap items-center gap-3 pt-0.5">
              <ReactStars
                count={5}
                value={rating}
                size={26}
                activeColor="#eab308"
                edit
                onChange={(v) => setRating(v)}
              />
              <span className="text-sm text-muted-foreground">
                {rating > 0 ? `${rating} / 5` : "Choose 1–5 stars"}
              </span>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="sr-only">Or pick a number</span>
                <select
                  aria-label="Rating value"
                  className={selectClass}
                  value={rating > 0 ? String(rating) : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRating(v === "" ? 0 : Number(v));
                  }}
                >
                  <option value="">Select…</option>
                  <option value="1">1 — Poor</option>
                  <option value="2">2 — Fair</option>
                  <option value="3">3 — Good</option>
                  <option value="4">4 — Very good</option>
                  <option value="5">5 — Excellent</option>
                </select>
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="compose-title">Title</Label>
            <Input
              id="compose-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short headline"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="compose-body">Review</Label>
            <textarea
              id="compose-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              required
              rows={5}
              placeholder="Review text shown on the product page"
              className="min-h-[120px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
            />
          </div>

          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Picture / video (optional, max {REVIEW_MAX_FILES} files)
            </Label>
            <p className="mb-2 mt-1 text-xs text-muted-foreground">
              Images up to 2 MB each; videos up to 5 MB each. Preview below — use remove to drop a file
              before saving.
            </p>
            <div className="flex flex-wrap gap-3">
              {pendingAttachments.map((a) => (
                <div
                  key={a.id}
                  className="relative h-24 w-24 shrink-0 overflow-hidden rounded-md border border-border bg-muted/30"
                >
                  {a.kind === "image" ? (
                    <img src={a.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <video
                      src={a.previewUrl}
                      className="h-full w-full object-cover"
                      muted
                      playsInline
                      preload="metadata"
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => removePendingAttachment(a.id)}
                    className="absolute right-1 top-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm ring-1 ring-border hover:bg-muted"
                    aria-label="Remove file"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {pendingAttachments.length < REVIEW_MAX_FILES ? (
                <label
                  htmlFor={MEDIA_INPUT_ID}
                  className="flex h-24 w-24 shrink-0 cursor-pointer items-center justify-center rounded-md border border-dashed border-input bg-muted/40 text-3xl text-muted-foreground hover:bg-muted/60"
                >
                  📷
                </label>
              ) : null}
            </div>
            <input
              ref={fileInputRef}
              id={MEDIA_INPUT_ID}
              type="file"
              accept="image/*,video/*"
              multiple
              className="sr-only"
              onChange={onPendingMediaChange}
            />
            <p className="mt-2 text-xs text-muted-foreground">
              {pendingAttachments.length >= REVIEW_MAX_FILES
                ? `Maximum ${REVIEW_MAX_FILES} files. Remove one to add another.`
                : "Tap the camera to add files."}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="compose-status">Moderation status</Label>
            <select
              id="compose-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as ReviewModerationStatus)}
              className={selectClass}
            >
              <option value="approved">Approved (live when product is public)</option>
              <option value="pending">Pending</option>
              <option value="rejected">Rejected (hidden)</option>
            </select>
          </div>
        </form>
      </AdminStandardDialogContent>
    </Dialog>
  );
}
