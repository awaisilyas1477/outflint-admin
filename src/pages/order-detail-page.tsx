import { useCallback, useEffect, useId, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, MessageCircle, Copy, Pencil, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { PageHeader } from "@/components/dashboard/page-header";
import { AdminConfirmDeleteDialog } from "@/components/dashboard/admin-confirm-delete-dialog";
import { AdminTextarea } from "@/components/dashboard/admin-textarea";
import {
  OrderPackingSlip,
  printOrderPackingSlip,
  type PackingSlipStoreInfo,
} from "@/components/dashboard/order-packing-slip";
import { toast } from "sonner";
import { ADMIN_LIST_CARD_CLASS } from "@/components/dashboard/admin-list-shell";
import { cn } from "@/lib/utils";
import {
  deleteOrderAdmin,
  fetchOrderByIdAdmin,
  fetchOrderItemsAdmin,
  fetchOrderStatusHistoryAdmin,
  updateOrderInternalNoteAdmin,
  updateOrderShippingAdmin,
  updateOrderStatusAdmin,
  type OrderItemRow,
  type OrderRow,
  type OrderStatus,
  type OrderStatusHistoryRow,
} from "@/lib/supabase/orders";
import { formatOrderStatus, orderStatusVariant } from "@/lib/order-status";
import {
  deriveFulfillmentLane,
  derivePaymentLane,
  formatOptionSnapshot,
  formatPaymentMethod,
  FULFILLMENT_LANE_LABELS,
  fulfillmentLaneVariant,
  PAYMENT_LANE_LABELS,
  paymentLaneVariant,
} from "@/lib/order-lanes";
import { formatMinorUnits } from "@/lib/format-money";
import { supabase } from "@/lib/supabase/client";
import { copyTextToClipboard, formatOrderDispatchText, formatOrderWhatsAppConfirmation } from "@/lib/order-dispatch";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { fetchStoreSettings } from "@/lib/supabase/store-settings";

const STATUSES: OrderStatus[] = [
  "pending",
  "confirmed",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
];

const ORDER_PAGE = "space-y-6";
const CARD_H =
  "flex flex-row items-center justify-between space-y-0 border-b border-border/60 px-5 py-4";
const CARD_B = "space-y-3 px-5 py-4";

function MoneyRow({
  label,
  value,
  emphasize,
  muted,
}: {
  label: string;
  value: string;
  emphasize?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 text-sm",
        emphasize && "border-t border-border/60 pt-2.5",
      )}
    >
      <span
        className={cn(
          muted ? "text-muted-foreground" : "text-foreground",
          emphasize && "font-semibold",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          emphasize ? "text-base font-semibold" : "font-medium",
          muted && "text-muted-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

function formatPlacedAt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();
  const noteId = useId();
  const internalNoteId = useId();
  const [order, setOrder] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [history, setHistory] = useState<OrderStatusHistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [nextStatus, setNextStatus] = useState<OrderStatus | "">("");
  const [note, setNote] = useState("");
  const [internalNote, setInternalNote] = useState("");
  const [savingInternalNote, setSavingInternalNote] = useState(false);
  const [shippingEdit, setShippingEdit] = useState(false);
  const [shippingForm, setShippingForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    shipping_street: "",
    shipping_city: "",
    shipping_postal_code: "",
    shipping_province: "",
  });
  const [savingShipping, setSavingShipping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [slipStore, setSlipStore] = useState<PackingSlipStoreInfo | undefined>();

  const load = useCallback(async () => {
    if (!orderId || !supabase) {
      toast.error(!supabase ? "Supabase is not configured." : "Missing order id.");
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [o, its, hist] = await Promise.all([
        fetchOrderByIdAdmin(orderId),
        fetchOrderItemsAdmin(orderId),
        fetchOrderStatusHistoryAdmin(orderId),
      ]);
      setOrder(o);
      setItems(its);
      setHistory(hist);
      if (o) {
        setNextStatus(o.status);
        setInternalNote(o.admin_internal_note ?? "");
        setShippingForm({
          first_name: o.first_name,
          last_name: o.last_name,
          phone: o.phone,
          email: o.email,
          shipping_street: o.shipping_street,
          shipping_city: o.shipping_city,
          shipping_postal_code: o.shipping_postal_code,
          shipping_province: o.shipping_province,
        });
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load order.");
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  useEffect(() => {
    void fetchStoreSettings().then(({ row }) => {
      if (!row) return;
      setSlipStore({
        storeName: row.store_name,
        supportPhone: row.footer_phone?.trim() || undefined,
        supportEmail: row.support_email?.trim() || undefined,
      });
    });
  }, []);

  async function onSaveStatus() {
    if (!orderId || !order || !nextStatus || nextStatus === order.status) {
      toast.error("Choose a new status to update.");
      return;
    }
    setSaving(true);
    const res = await updateOrderStatusAdmin(orderId, nextStatus, note || undefined);
    setSaving(false);
    if (!res.ok) {
      toast.error(res.error ?? "Update failed.");
      return;
    }
    setNote("");
    if (res.stockRestored) {
      toast.success("Status updated — stock restored to inventory.");
    } else {
      toast.success("Status updated.");
    }
    await load();
  }

  async function onSaveInternalNote() {
    if (!orderId) return;
    setSavingInternalNote(true);
    const res = await updateOrderInternalNoteAdmin(orderId, internalNote);
    setSavingInternalNote(false);
    if (!res.ok) {
      toast.error(res.error ?? "Save failed.");
      return;
    }
    toast.success("Internal note saved.");
    await load();
  }

  async function onSaveShipping() {
    if (!orderId) return;
    setSavingShipping(true);
    const res = await updateOrderShippingAdmin(orderId, shippingForm);
    setSavingShipping(false);
    if (!res.ok) {
      toast.error(res.error ?? "Save failed.");
      return;
    }
    toast.success("Shipping details updated.");
    setShippingEdit(false);
    await load();
  }

  async function onDeleteOrder() {
    if (!orderId) return;
    setDeleting(true);
    const res = await deleteOrderAdmin(orderId);
    setDeleting(false);
    if (!res.ok) {
      toast.error(res.error ?? "Delete failed.");
      return;
    }
    toast.success(
      res.stockRestored ? "Order deleted — stock restored to inventory." : "Order deleted.",
    );
    navigate("/dashboard/orders", { replace: true });
  }

  useEffect(() => {
    if (!orderId) {
      toast.error("Invalid order link.");
    }
  }, [orderId]);

  if (!orderId) {
    return (
      <p className="text-sm text-destructive" role="alert">
        Invalid order link.
      </p>
    );
  }

  const orderRef = order?.order_number ?? orderId.slice(0, 8);
  const isRiskyDelete =
    order != null && (order.status === "delivered" || order.status === "shipped");

  async function onCopyDispatch() {
    if (!order) return;
    const ok = await copyTextToClipboard(formatOrderDispatchText(order, items));
    toast[ok ? "success" : "error"](ok ? "Order details copied." : "Copy failed.");
  }

  function onWhatsAppCustomer() {
    if (!order) return;
    const url = buildWhatsAppUrl(order.phone, formatOrderWhatsAppConfirmation(order, items));
    if (!url) {
      toast.error("No valid phone on this order.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  const pay = order ? derivePaymentLane(order.status, order.payment_method) : null;
  const fulfill = order ? deriveFulfillmentLane(order.status) : null;
  const unitCount = items.reduce((n, l) => n + l.quantity, 0);

  const deliverySnap =
    order?.checkout_snapshot && typeof order.checkout_snapshot === "object"
      ? (order.checkout_snapshot as Record<string, unknown>).delivery
      : null;
  const delivery =
    deliverySnap && typeof deliverySnap === "object"
      ? (deliverySnap as Record<string, unknown>)
      : null;

  return (
    <div className={ORDER_PAGE}>
      <PageHeader
        title={order?.order_number ? `#${order.order_number}` : "Order detail"}
        description={
          order
            ? formatPlacedAt(order.created_at)
            : "Line items, payment, fulfillment, and packing slip."
        }
        className="mb-2 space-y-3 border-b border-border/60 pb-5 [&_h1]:font-mono"
        backLink={{ to: "/dashboard/orders", label: "Orders" }}
        actions={
          order ? (
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" variant="outline" size="sm" onClick={() => void onCopyDispatch()}>
                <Copy className="mr-1.5 h-3.5 w-3.5" />
                Copy
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={onWhatsAppCustomer}>
                <MessageCircle className="mr-1.5 h-3.5 w-3.5" />
                WhatsApp confirm
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => printOrderPackingSlip()}
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            </div>
          ) : null
        }
      />

      <AdminConfirmDeleteDialog
        open={deleteOpen}
        onOpenChange={(o) => !deleting && setDeleteOpen(o)}
        title={isRiskyDelete ? "Delete shipped/delivered order?" : "Delete this order?"}
        subtitle={
          <>
            {isRiskyDelete ? (
              <span className="mb-2 block font-medium text-destructive">
                This order was already shipped or delivered — delete only for test/cleanup.
              </span>
            ) : null}
            Order <span className="font-mono font-medium text-foreground">{orderRef}</span> and all
            related line items will be removed permanently. Variant stock will be returned to
            inventory if not already restored.
          </>
        }
        busy={deleting}
        onConfirm={() => void onDeleteOrder()}
      />

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Loading order…
        </div>
      ) : !order ? (
        <p className="text-sm text-muted-foreground">Order not found.</p>
      ) : (
        <>
          {pay && fulfill ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={paymentLaneVariant(pay)} className="font-medium">
                {PAYMENT_LANE_LABELS[pay]}
              </Badge>
              <Badge variant={fulfillmentLaneVariant(fulfill)} className="font-medium">
                {FULFILLMENT_LANE_LABELS[fulfill]}
              </Badge>
              <Badge variant={orderStatusVariant(order.status)} className="capitalize font-medium">
                {formatOrderStatus(order.status)}
              </Badge>
              {!order.user_id ? <Badge variant="secondary">Guest</Badge> : null}
              {order.customer_note ? <Badge variant="outline">Customer note</Badge> : null}
              {order.discount_cents > 0 ? <Badge variant="warning">Discount</Badge> : null}
            </div>
          ) : null}

          <OrderPackingSlip order={order} items={items} store={slipStore} />

          <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            {/* ——— Main column ——— */}
            <div className="space-y-5">
              <Card className={ADMIN_LIST_CARD_CLASS}>
                <CardHeader className={CARD_H}>
                  <div>
                    <CardTitle className="text-[15px] font-semibold">Unfulfilled items</CardTitle>
                    <CardDescription className="mt-0.5 text-xs">
                      {items.length} line{items.length === 1 ? "" : "s"} · {unitCount} unit
                      {unitCount === 1 ? "" : "s"}
                    </CardDescription>
                  </div>
                  {fulfill ? (
                    <Badge variant={fulfillmentLaneVariant(fulfill)}>
                      {FULFILLMENT_LANE_LABELS[fulfill]}
                    </Badge>
                  ) : null}
                </CardHeader>
                <CardContent className="p-0">
                  {items.length === 0 ? (
                    <p className="px-5 py-6 text-sm text-muted-foreground">No line items.</p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {items.map((line) => {
                        const img = line.primary_image_url_snapshot?.trim() || "";
                        const opts = formatOptionSnapshot(line.option_values_snapshot);
                        return (
                          <li key={line.id} className="flex gap-4 px-5 py-4">
                            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border/60 bg-muted/40">
                              {img ? (
                                <img
                                  src={img}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    e.currentTarget.style.display = "none";
                                  }}
                                />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                  —
                                </div>
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-medium leading-snug">
                                    {line.product_name_snapshot}
                                  </p>
                                  {opts ? (
                                    <p className="mt-0.5 text-xs text-muted-foreground">{opts}</p>
                                  ) : null}
                                  <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[11px] text-muted-foreground">
                                    {line.sku_snapshot ? <span>SKU {line.sku_snapshot}</span> : null}
                                    {line.inventory_on_hand_before != null ? (
                                      <span>
                                        Stock @ order: {line.inventory_on_hand_before} on hand
                                        {line.inventory_reserved_before != null
                                          ? ` · ${line.inventory_reserved_before} reserved`
                                          : ""}
                                      </span>
                                    ) : null}
                                  </p>
                                </div>
                                <div className="shrink-0 text-right">
                                  <p className="text-sm font-semibold tabular-nums">
                                    {formatMinorUnits(line.line_subtotal_cents, order.currency)}
                                  </p>
                                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                                    {formatMinorUnits(line.unit_price_cents, order.currency)} ×{" "}
                                    {line.quantity}
                                  </p>
                                  {line.compare_at_unit_price_cents != null &&
                                  line.compare_at_unit_price_cents > line.unit_price_cents ? (
                                    <p className="text-[11px] text-muted-foreground line-through tabular-nums">
                                      {formatMinorUnits(
                                        line.compare_at_unit_price_cents,
                                        order.currency,
                                      )}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  )}

                  <div className="space-y-2 border-t border-border/60 bg-muted/10 px-5 py-4">
                    <MoneyRow
                      label="Subtotal"
                      value={formatMinorUnits(order.subtotal_cents, order.currency)}
                      muted
                    />
                    <MoneyRow
                      label="Shipping"
                      value={formatMinorUnits(order.shipping_cents, order.currency)}
                      muted
                    />
                    {order.discount_cents > 0 ? (
                      <MoneyRow
                        label="Discount"
                        value={`−${formatMinorUnits(order.discount_cents, order.currency)}`}
                        muted
                      />
                    ) : null}
                    <MoneyRow
                      label="Total"
                      value={formatMinorUnits(order.total_cents, order.currency)}
                      emphasize
                    />
                  </div>
                </CardContent>
              </Card>

              <Card className={ADMIN_LIST_CARD_CLASS}>
                <CardHeader className={CARD_H}>
                  <div>
                    <CardTitle className="text-[15px] font-semibold">Timeline</CardTitle>
                    <CardDescription className="mt-0.5 text-xs">
                      Status history for this order
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className={CARD_B}>
                  {history.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No history yet.</p>
                  ) : (
                    <ol className="relative space-y-0 border-l border-border/70 pl-4">
                      {history.map((h, i) => (
                        <li key={h.id} className="relative pb-3.5 last:pb-0">
                          <span
                            className={cn(
                              "absolute -left-[1.3125rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background",
                              i === 0 ? "bg-foreground" : "bg-muted-foreground/40",
                            )}
                            aria-hidden
                          />
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Badge
                              variant={orderStatusVariant(h.status)}
                              className="capitalize font-medium"
                            >
                              {formatOrderStatus(h.status)}
                            </Badge>
                            <time className="text-[11px] text-muted-foreground">
                              {new Date(h.created_at).toLocaleString()}
                            </time>
                          </div>
                          {h.note ? (
                            <p className="mt-1 text-xs leading-snug text-muted-foreground">
                              {h.note}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  )}
                </CardContent>
              </Card>

              {delivery ? (
                <Card className={ADMIN_LIST_CARD_CLASS}>
                  <CardHeader className={CARD_H}>
                    <div>
                      <CardTitle className="text-[15px] font-semibold">
                        Delivery rules at checkout
                      </CardTitle>
                      <CardDescription className="mt-0.5 text-xs">
                        Snapshot used to price shipping
                      </CardDescription>
                    </div>
                  </CardHeader>
                  <CardContent className={CARD_B}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="rounded-md border border-border/50 bg-muted/10 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Standard rate
                        </p>
                        <p className="mt-0.5 text-sm font-medium tabular-nums">
                          {typeof delivery.standard_delivery_paisa === "number"
                            ? formatMinorUnits(delivery.standard_delivery_paisa, "PKR")
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-md border border-border/50 bg-muted/10 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Free shipping
                        </p>
                        <p className="mt-0.5 text-sm font-medium">
                          {delivery.free_shipping_applied === true
                            ? "Applied"
                            : delivery.free_shipping_applied === false
                              ? "Not applied"
                              : "—"}
                        </p>
                      </div>
                      <div className="rounded-md border border-border/50 bg-muted/10 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Charged
                        </p>
                        <p className="mt-0.5 text-sm font-medium tabular-nums">
                          {typeof delivery.shipping_charged_paisa === "number"
                            ? formatMinorUnits(delivery.shipping_charged_paisa, order.currency)
                            : "—"}
                        </p>
                      </div>
                      <div className="rounded-md border border-border/50 bg-muted/10 px-3 py-2">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Merch subtotal
                        </p>
                        <p className="mt-0.5 text-sm font-medium tabular-nums">
                          {typeof delivery.merchandise_subtotal_paisa === "number"
                            ? formatMinorUnits(
                                delivery.merchandise_subtotal_paisa,
                                order.currency,
                              )
                            : "—"}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>

            {/* ——— Sidebar ——— */}
            <aside className="space-y-5 lg:sticky lg:top-4">
              <Card className={ADMIN_LIST_CARD_CLASS}>
                <CardHeader className={CARD_H}>
                  <CardTitle className="text-[15px] font-semibold">Payment</CardTitle>
                  {pay ? (
                    <Badge variant={paymentLaneVariant(pay)}>{PAYMENT_LANE_LABELS[pay]}</Badge>
                  ) : null}
                </CardHeader>
                <CardContent className={CARD_B}>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Method</dt>
                      <dd className="font-medium text-right">
                        {formatPaymentMethod(order.payment_method)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Amount</dt>
                      <dd className="font-semibold tabular-nums">
                        {formatMinorUnits(order.total_cents, order.currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-muted-foreground">Currency</dt>
                      <dd className="font-medium">{order.currency}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>

              <Card className={ADMIN_LIST_CARD_CLASS}>
                <CardHeader className={CARD_H}>
                  <div>
                    <CardTitle className="text-[15px] font-semibold">Update status</CardTitle>
                    <CardDescription className="mt-0.5 text-xs">
                      Adds a timeline entry
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className={CARD_B}>
                  <div className="space-y-1.5">
                    <Label htmlFor="status-select" className="text-xs">
                      Status
                    </Label>
                    <NativeSelect
                      id="status-select"
                      value={nextStatus}
                      onChange={(e) => setNextStatus(e.target.value as OrderStatus)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {formatOrderStatus(s)}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={noteId} className="text-xs">
                      Note (optional)
                    </Label>
                    <AdminTextarea
                      id={noteId}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="e.g. Shipped via TCS…"
                    />
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    className="w-full"
                    disabled={saving || nextStatus === order.status}
                    onClick={() => void onSaveStatus()}
                  >
                    {saving ? "Saving…" : "Update status"}
                  </Button>
                </CardContent>
              </Card>

              <Card className={ADMIN_LIST_CARD_CLASS}>
                <CardHeader className={CARD_H}>
                  <div>
                    <CardTitle className="text-[15px] font-semibold">Customer</CardTitle>
                    <CardDescription className="mt-0.5 text-xs">
                      {order.user_id ? "Signed-in account" : "Guest checkout"}
                    </CardDescription>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => setShippingEdit((v) => !v)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    {shippingEdit ? "Cancel" : "Edit"}
                  </Button>
                </CardHeader>
                <CardContent className={CARD_B}>
                  {shippingEdit ? (
                    <div className="grid gap-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor="ship-first" className="text-xs">
                            First
                          </Label>
                          <Input
                            id="ship-first"
                            value={shippingForm.first_name}
                            onChange={(e) =>
                              setShippingForm((f) => ({ ...f, first_name: e.target.value }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="ship-last" className="text-xs">
                            Last
                          </Label>
                          <Input
                            id="ship-last"
                            value={shippingForm.last_name}
                            onChange={(e) =>
                              setShippingForm((f) => ({ ...f, last_name: e.target.value }))
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="ship-phone" className="text-xs">
                          Phone
                        </Label>
                        <Input
                          id="ship-phone"
                          value={shippingForm.phone}
                          onChange={(e) =>
                            setShippingForm((f) => ({ ...f, phone: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="ship-email" className="text-xs">
                          Email
                        </Label>
                        <Input
                          id="ship-email"
                          type="email"
                          value={shippingForm.email}
                          onChange={(e) =>
                            setShippingForm((f) => ({ ...f, email: e.target.value }))
                          }
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="ship-street" className="text-xs">
                          Street
                        </Label>
                        <Input
                          id="ship-street"
                          value={shippingForm.shipping_street}
                          onChange={(e) =>
                            setShippingForm((f) => ({
                              ...f,
                              shipping_street: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <Label htmlFor="ship-city" className="text-xs">
                            City
                          </Label>
                          <Input
                            id="ship-city"
                            value={shippingForm.shipping_city}
                            onChange={(e) =>
                              setShippingForm((f) => ({
                                ...f,
                                shipping_city: e.target.value,
                              }))
                            }
                          />
                        </div>
                        <div className="space-y-1">
                          <Label htmlFor="ship-province" className="text-xs">
                            Province
                          </Label>
                          <Input
                            id="ship-province"
                            value={shippingForm.shipping_province}
                            onChange={(e) =>
                              setShippingForm((f) => ({
                                ...f,
                                shipping_province: e.target.value,
                              }))
                            }
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="ship-postal" className="text-xs">
                          Postal
                        </Label>
                        <Input
                          id="ship-postal"
                          value={shippingForm.shipping_postal_code}
                          onChange={(e) =>
                            setShippingForm((f) => ({
                              ...f,
                              shipping_postal_code: e.target.value,
                            }))
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        disabled={savingShipping}
                        onClick={() => void onSaveShipping()}
                      >
                        {savingShipping ? "Saving…" : "Save"}
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3 text-sm">
                      <div>
                        <p className="font-medium">
                          {[order.first_name, order.last_name].filter(Boolean).join(" ") ||
                            "—"}
                        </p>
                        {order.phone ? (
                          <p className="mt-0.5 text-muted-foreground">{order.phone}</p>
                        ) : null}
                        {order.email ? (
                          <p className="mt-0.5 break-all text-xs text-muted-foreground">
                            {order.email}
                          </p>
                        ) : null}
                      </div>
                      <div className="border-t border-border/60 pt-3">
                        <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          Shipping address
                        </p>
                        <p className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground">
                          {[
                            order.shipping_street,
                            [order.shipping_city, order.shipping_province]
                              .filter(Boolean)
                              .join(", "),
                            order.shipping_postal_code,
                          ]
                            .filter(Boolean)
                            .join("\n") || "—"}
                        </p>
                      </div>
                      {order.customer_note ? (
                        <div className="rounded-md border border-amber-500/25 bg-amber-500/5 px-3 py-2">
                          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-400">
                            Customer note
                          </p>
                          <p className="mt-1 text-xs leading-snug">{order.customer_note}</p>
                        </div>
                      ) : null}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className={ADMIN_LIST_CARD_CLASS}>
                <CardHeader className={CARD_H}>
                  <div>
                    <CardTitle className="text-[15px] font-semibold">Internal note</CardTitle>
                    <CardDescription className="mt-0.5 text-xs">
                      Staff only — never shown to customer
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className={CARD_B}>
                  <AdminTextarea
                    id={internalNoteId}
                    value={internalNote}
                    onChange={(e) => setInternalNote(e.target.value)}
                    rows={4}
                    placeholder="e.g. Customer called — change address before dispatch"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={savingInternalNote}
                    onClick={() => void onSaveInternalNote()}
                  >
                    {savingInternalNote ? "Saving…" : "Save note"}
                  </Button>
                </CardContent>
              </Card>

              <p className="px-1 text-[11px] text-muted-foreground">
                Order ID{" "}
                <span className="font-mono text-foreground/80">{order.id.slice(0, 8)}…</span>
                <span className="mx-1.5 text-border">·</span>
                Updated {new Date(order.updated_at).toLocaleString()}
              </p>
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
