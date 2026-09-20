import { useCallback, useEffect, useId, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Pencil, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { PageHeader } from "@/components/dashboard/page-header";
import { toast } from "sonner";
import {
  AdminListCard,
  AdminListEmpty,
  AdminListSkeleton,
  ADMIN_LIST_CARD_CLASS,
  ADMIN_LIST_CARD_CONTENT_CLASS,
  ADMIN_LIST_CARD_HEADER_CLASS,
  ADMIN_LIST_PAGE_CLASS,
  TableContainer,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW,
  adminTh,
  adminThEnd,
  adminTd,
} from "@/components/dashboard/admin-list-shell";
import { cn } from "@/lib/utils";
import {
  fetchCustomerByIdAdmin,
  updateCustomerAdmin,
  type PublicUserRow,
} from "@/lib/supabase/customers";
import {
  fetchOrdersByUserIdAdmin,
  fetchOrdersByPhoneAdmin,
  type OrderRow,
  type OrderStatus,
} from "@/lib/supabase/orders";
import { fetchReviewsByUserIdAdmin, type ReviewAdminRow } from "@/lib/supabase/reviews-admin";
import { fetchVoucherInstancesByPublicUserId, type VoucherInstanceRow } from "@/lib/supabase/vouchers";
import { fetchWishlistByUserIdAdmin, type WishlistAdminRow } from "@/lib/supabase/wishlist-admin";
import { formatMinorUnits } from "@/lib/format-money";
import { supabase } from "@/lib/supabase/client";

function displayName(u: PublicUserRow): string {
  const n = `${u.first_name} ${u.last_name}`.trim();
  return n || "Customer";
}

function orderStatusVariant(
  s: OrderStatus,
): "default" | "secondary" | "outline" | "success" | "destructive" {
  if (s === "delivered" || s === "paid") return "success";
  if (s === "cancelled" || s === "refunded") return "destructive";
  if (s === "pending") return "secondary";
  return "outline";
}

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const [customer, setCustomer] = useState<PublicUserRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [guestOrders, setGuestOrders] = useState<OrderRow[]>([]);
  const [reviews, setReviews] = useState<ReviewAdminRow[]>([]);
  const [vouchers, setVouchers] = useState<VoucherInstanceRow[]>([]);
  const [wishlist, setWishlist] = useState<WishlistAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState({ first_name: "", last_name: "", phone: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const firstNameId = useId();
  const lastNameId = useId();
  const phoneId = useId();

  const load = useCallback(async () => {
    if (!customerId) {
      setLoading(false);
      return;
    }
    if (!supabase) {
      toast.error("Supabase is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [c, o, r, v, w] = await Promise.all([
        fetchCustomerByIdAdmin(customerId),
        fetchOrdersByUserIdAdmin(customerId, { limit: 100 }),
        fetchReviewsByUserIdAdmin(customerId, 80),
        fetchVoucherInstancesByPublicUserId(customerId, 80),
        fetchWishlistByUserIdAdmin(customerId, 80),
      ]);
      setCustomer(c);
      if (c) {
        setEditForm({
          first_name: c.first_name,
          last_name: c.last_name,
          phone: c.phone ?? "",
        });
      }
      setOrders(o);
      if (c?.phone?.trim()) {
        const guest = await fetchOrdersByPhoneAdmin(c.phone, {
          limit: 50,
          excludeUserId: customerId,
        });
        const linkedIds = new Set(o.map((x) => x.id));
        setGuestOrders(guest.filter((g) => !linkedIds.has(g.id)));
      } else {
        setGuestOrders([]);
      }
      setReviews(r);
      setVouchers(v);
      setWishlist(w);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load customer.");
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function onSaveProfile() {
    if (!customerId) return;
    setSavingProfile(true);
    const res = await updateCustomerAdmin(customerId, editForm);
    setSavingProfile(false);
    if (!res.ok) {
      toast.error(res.error ?? "Save failed.");
      return;
    }
    toast.success("Customer profile updated.");
    setEditing(false);
    await load();
  }

  useEffect(() => {
    if (!customerId) {
      toast.error("Invalid customer link.");
    }
  }, [customerId]);

  useEffect(() => {
    if (!loading && customerId && supabase && !customer) {
      toast.error("Customer not found.");
    }
  }, [loading, customerId, customer]);

  if (!customerId) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Invalid customer link.
      </p>
    );
  }

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title={customer ? displayName(customer) : "Customer"}
        description="Profile, orders, reviews, wishlist saves, and vouchers for this account."
        actions={
          <Button type="button" variant="outline" size="sm" asChild>
            <Link to="/dashboard/customers">
              <ArrowLeft className="mr-2 h-4 w-4" />
              All customers
            </Link>
          </Button>
        }
      />

      {loading ? (
        <AdminListSkeleton rows={4} />
      ) : !customer ? (
        <p className="text-sm text-muted-foreground" role="status">
          Customer not found.
        </p>
      ) : (
        <div className="space-y-8">
          <div className="grid gap-6 lg:grid-cols-3">
            <Card
              className={cn(
                ADMIN_LIST_CARD_CLASS,
                "border-l-4 border-l-primary/35 bg-linear-to-br from-primary/4 to-transparent lg:col-span-2 dark:from-primary/10",
              )}
            >
              <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
                <div className="flex items-start gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <User className="h-6 w-6" aria-hidden />
                  </span>
                  <div className="min-w-0 space-y-1">
                    <CardTitle className="text-xl">{displayName(customer)}</CardTitle>
                    <CardDescription>Public profile id and auth linkage.</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent
                className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "grid gap-4 text-sm sm:grid-cols-2")}
              >
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Phone
                  </p>
                  <p className="mt-1 font-medium tabular-nums">{customer.phone?.trim() || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Sign-up
                  </p>
                  <p className="mt-1 capitalize">{customer.signup_provider ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Gender
                  </p>
                  <p className="mt-1">{customer.gender ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Date of birth
                  </p>
                  <p className="mt-1">{customer.date_of_birth?.trim() || "—"}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Profile id
                  </p>
                  <p className="mt-1 font-mono text-xs break-all text-muted-foreground">{customer.id}</p>
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Auth user id
                  </p>
                  <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
                    {customer.auth_id}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Created
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {new Date(customer.created_at).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Updated
                  </p>
                  <p className="mt-1 text-muted-foreground">
                    {new Date(customer.updated_at).toLocaleString()}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className={ADMIN_LIST_CARD_CLASS}>
              <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
                <CardTitle className="text-base">At a glance</CardTitle>
                <CardDescription>Counts from this workspace.</CardDescription>
              </CardHeader>
              <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "space-y-4")}>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3 dark:bg-muted/10">
                  <span className="text-sm text-muted-foreground">Orders</span>
                  <span className="text-2xl font-semibold tabular-nums">{orders.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3 dark:bg-muted/10">
                  <span className="text-sm text-muted-foreground">Reviews</span>
                  <span className="text-2xl font-semibold tabular-nums">{reviews.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3 dark:bg-muted/10">
                  <span className="text-sm text-muted-foreground">Vouchers</span>
                  <span className="text-2xl font-semibold tabular-nums">{vouchers.length}</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 px-4 py-3 dark:bg-muted/10">
                  <span className="text-sm text-muted-foreground">Wishlist</span>
                  <span className="text-2xl font-semibold tabular-nums">{wishlist.length}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card className={ADMIN_LIST_CARD_CLASS}>
            <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base">Edit profile</CardTitle>
                  <CardDescription>Update name and phone for support cases.</CardDescription>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing((v) => !v)}>
                  <Pencil className="mr-2 h-4 w-4" />
                  {editing ? "Cancel" : "Edit"}
                </Button>
              </div>
            </CardHeader>
            {editing ? (
              <CardContent className={cn(ADMIN_LIST_CARD_CONTENT_CLASS, "grid gap-4 sm:grid-cols-2")}>
                <div className="space-y-2">
                  <Label htmlFor={firstNameId}>First name</Label>
                  <Input
                    id={firstNameId}
                    value={editForm.first_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, first_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={lastNameId}>Last name</Label>
                  <Input
                    id={lastNameId}
                    value={editForm.last_name}
                    onChange={(e) => setEditForm((f) => ({ ...f, last_name: e.target.value }))}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor={phoneId}>Phone</Label>
                  <Input
                    id={phoneId}
                    value={editForm.phone}
                    onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Button type="button" size="sm" disabled={savingProfile} onClick={() => void onSaveProfile()}>
                    {savingProfile ? "Saving…" : "Save profile"}
                  </Button>
                </div>
              </CardContent>
            ) : null}
          </Card>

          <AdminListCard
            title="Orders"
            description="Checkouts linked to this customer account. Guest orders without a user link appear only under Orders."
          >
            {orders.length === 0 ? (
              <AdminListEmpty>No orders for this profile yet.</AdminListEmpty>
            ) : (
              <TableContainer>
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead>
                    <tr className={ADMIN_TABLE_HEAD}>
                      <th className={adminTh()}>Reference</th>
                      <th className={adminTh()}>Email</th>
                      <th className={adminTh()}>Total</th>
                      <th className={adminTh()}>Status</th>
                      <th className={adminTh()}>Placed</th>
                      <th className={adminThEnd()} />
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((o) => (
                      <tr key={o.id} className={ADMIN_TABLE_ROW}>
                        <td className={adminTd("font-mono text-xs")}>
                          {o.order_number ?? o.id.slice(0, 8)}
                        </td>
                        <td className={adminTd()}>
                          <span className="max-w-[200px] truncate" title={o.email}>
                            {o.email || "—"}
                          </span>
                        </td>
                        <td className={adminTd("tabular-nums")}>
                          {formatMinorUnits(o.total_cents, o.currency)}
                        </td>
                        <td className={adminTd()}>
                          <Badge variant={orderStatusVariant(o.status)} className="capitalize">
                            {o.status}
                          </Badge>
                        </td>
                        <td className={adminTd("text-muted-foreground")}>
                          {new Date(o.created_at).toLocaleDateString()}
                        </td>
                        <td className={cn(adminTd(), "text-right")}>
                          <Button variant="ghost" size="sm" className="font-medium text-primary" asChild>
                            <Link to={`/dashboard/orders/${o.id}`}>Open</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableContainer>
            )}
          </AdminListCard>

          {guestOrders.length > 0 ? (
            <AdminListCard
              title="Guest orders (same phone)"
              description="Checkouts placed without signing in but using this customer's phone number."
            >
              <TableContainer>
                <table className="w-full min-w-[680px] text-left text-sm">
                  <thead>
                    <tr className={ADMIN_TABLE_HEAD}>
                      <th className={adminTh()}>Reference</th>
                      <th className={adminTh()}>Email</th>
                      <th className={adminTh()}>Total</th>
                      <th className={adminTh()}>Status</th>
                      <th className={adminTh()}>Placed</th>
                      <th className={adminThEnd()} />
                    </tr>
                  </thead>
                  <tbody>
                    {guestOrders.map((o) => (
                      <tr key={o.id} className={ADMIN_TABLE_ROW}>
                        <td className={adminTd("font-mono text-xs")}>
                          {o.order_number ?? o.id.slice(0, 8)}
                        </td>
                        <td className={adminTd()}>
                          <span className="max-w-[200px] truncate" title={o.email}>
                            {o.email || "—"}
                          </span>
                        </td>
                        <td className={adminTd("tabular-nums")}>
                          {formatMinorUnits(o.total_cents, o.currency)}
                        </td>
                        <td className={adminTd()}>
                          <Badge variant={orderStatusVariant(o.status)} className="capitalize">
                            {o.status}
                          </Badge>
                        </td>
                        <td className={adminTd("text-muted-foreground")}>
                          {new Date(o.created_at).toLocaleDateString()}
                        </td>
                        <td className={cn(adminTd(), "text-right")}>
                          <Button variant="ghost" size="sm" className="font-medium text-primary" asChild>
                            <Link to={`/dashboard/orders/${o.id}`}>Open</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableContainer>
            </AdminListCard>
          ) : null}

          <AdminListCard
            title="Reviews"
            description="Product reviews submitted while signed in as this customer."
          >
            {reviews.length === 0 ? (
              <AdminListEmpty>No reviews yet.</AdminListEmpty>
            ) : (
              <TableContainer>
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className={ADMIN_TABLE_HEAD}>
                      <th className={adminTh()}>Product</th>
                      <th className={adminTh()}>Rating</th>
                      <th className={adminTh()}>Title</th>
                      <th className={adminTh()}>Status</th>
                      <th className={adminTh()}>Submitted</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.map((r) => (
                      <tr key={r.id} className={ADMIN_TABLE_ROW}>
                        <td className={adminTd()}>
                          <span className="font-medium">{r.product_name ?? "—"}</span>
                        </td>
                        <td className={adminTd("tabular-nums")}>{r.rating}</td>
                        <td className={adminTd()}>
                          <span className="line-clamp-2 max-w-[240px]" title={r.title}>
                            {r.title || "—"}
                          </span>
                        </td>
                        <td className={adminTd()}>
                          <Badge variant="outline" className="capitalize">
                            {r.status}
                          </Badge>
                        </td>
                        <td className={adminTd("text-muted-foreground")}>
                          {new Date(r.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableContainer>
            )}
          </AdminListCard>

          <AdminListCard
            title="Wishlist"
            description="Saved SKUs and option-only demand from the storefront (same rows as Commerce → Wishlist)."
          >
            {wishlist.length === 0 ? (
              <AdminListEmpty>No wishlist items for this customer.</AdminListEmpty>
            ) : (
              <TableContainer>
                <table className="w-full min-w-[720px] text-left text-sm">
                  <thead>
                    <tr className={ADMIN_TABLE_HEAD}>
                      <th className={adminTh()}>Product</th>
                      <th className={adminTh()}>Type</th>
                      <th className={adminTh()}>Detail</th>
                      <th className={adminTh()}>Notify</th>
                      <th className={adminThEnd()}>Saved</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wishlist.map((w) => (
                      <tr key={w.id} className={ADMIN_TABLE_ROW}>
                        <td className={adminTd()}>
                          <div className="flex flex-col gap-0.5">
                            <span className="font-medium">{w.product_name ?? "—"}</span>
                            <Button variant="link" className="h-auto p-0 text-xs" asChild>
                              <Link to={`/dashboard/products/${w.product_id}`}>Open product</Link>
                            </Button>
                          </div>
                        </td>
                        <td className={adminTd()}>
                          <Badge variant={w.kind === "variant" ? "secondary" : "outline"}>
                            {w.kind === "variant" ? "SKU" : "Options"}
                          </Badge>
                        </td>
                        <td className={adminTd("max-w-[220px]")}>
                          {w.kind === "variant" ? (
                            <span className="font-mono text-xs">{w.variant_sku ?? "—"}</span>
                          ) : (
                            <span className="line-clamp-2 text-xs text-muted-foreground">
                              {w.requested_option_values
                                ? JSON.stringify(w.requested_option_values)
                                : "—"}
                            </span>
                          )}
                        </td>
                        <td className={adminTd()}>
                          <Badge variant={w.notify_on_restock ? "default" : "outline"}>
                            {w.notify_on_restock ? "yes" : "no"}
                          </Badge>
                        </td>
                        <td className={adminTd("text-muted-foreground")}>
                          {new Date(w.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableContainer>
            )}
          </AdminListCard>

          <AdminListCard
            title="Assigned vouchers"
            description="Codes assigned to this profile (single-use or campaign rows)."
          >
            {vouchers.length === 0 ? (
              <AdminListEmpty>No voucher codes assigned to this customer.</AdminListEmpty>
            ) : (
              <TableContainer>
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead>
                    <tr className={ADMIN_TABLE_HEAD}>
                      <th className={adminTh()}>Code</th>
                      <th className={adminTh()}>Label</th>
                      <th className={adminTh()}>Redeemed</th>
                      <th className={adminTh()}>Order</th>
                      <th className={adminTh()}>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vouchers.map((v) => (
                      <tr key={v.id} className={ADMIN_TABLE_ROW}>
                        <td className={adminTd("font-mono text-xs")}>{v.code}</td>
                        <td className={adminTd()}>{v.voucher_label ?? "—"}</td>
                        <td className={adminTd("text-muted-foreground")}>
                          {v.redeemed_at
                            ? new Date(v.redeemed_at).toLocaleString()
                            : "—"}
                        </td>
                        <td className={adminTd()}>
                          {v.order_id ? (
                            <Button variant="link" className="h-auto p-0 font-mono text-xs" asChild>
                              <Link to={`/dashboard/orders/${v.order_id}`}>Open order</Link>
                            </Button>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className={adminTd("text-muted-foreground")}>
                          {new Date(v.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TableContainer>
            )}
          </AdminListCard>
        </div>
      )}
    </div>
  );
}
