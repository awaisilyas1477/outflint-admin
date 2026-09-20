import type { OrderStatus, PaymentMethod } from "@/lib/supabase/orders";

/** Shopify-style payment lane (derived — no separate DB column yet). */
export type PaymentLane =
  | "unpaid"
  | "paid"
  | "refunded"
  | "cancelled"
  | "cod_collect";

/** Shopify-style fulfillment lane (derived from order status). */
export type FulfillmentLane =
  | "unfulfilled"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled"
  | "refunded";

export const PAYMENT_LANE_LABELS: Record<PaymentLane, string> = {
  unpaid: "Unpaid",
  paid: "Paid",
  refunded: "Refunded",
  cancelled: "Cancelled",
  cod_collect: "COD — collect",
};

export const FULFILLMENT_LANE_LABELS: Record<FulfillmentLane, string> = {
  unfulfilled: "Unfulfilled",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export function derivePaymentLane(
  status: OrderStatus,
  paymentMethod: PaymentMethod,
): PaymentLane {
  if (status === "cancelled") return "cancelled";
  if (status === "refunded") return "refunded";
  if (status === "paid" || status === "processing" || status === "shipped" || status === "delivered") {
    return "paid";
  }
  // pending | confirmed
  if (paymentMethod === "cod") return "cod_collect";
  return "unpaid";
}

export function deriveFulfillmentLane(status: OrderStatus): FulfillmentLane {
  if (status === "cancelled") return "cancelled";
  if (status === "refunded") return "refunded";
  if (status === "delivered") return "delivered";
  if (status === "shipped") return "shipped";
  if (status === "processing") return "processing";
  return "unfulfilled";
}

export function paymentLaneVariant(
  lane: PaymentLane,
): "default" | "secondary" | "outline" | "success" | "destructive" | "warning" {
  if (lane === "paid") return "success";
  if (lane === "refunded" || lane === "cancelled") return "destructive";
  if (lane === "cod_collect") return "warning";
  return "secondary";
}

export function fulfillmentLaneVariant(
  lane: FulfillmentLane,
): "default" | "secondary" | "outline" | "success" | "destructive" | "warning" {
  if (lane === "delivered") return "success";
  if (lane === "shipped" || lane === "processing") return "warning";
  if (lane === "cancelled" || lane === "refunded") return "destructive";
  return "secondary";
}

export function formatPaymentMethod(method: PaymentMethod): string {
  switch (method) {
    case "cod":
      return "Cash on delivery";
    case "card":
      return "Card";
    case "bank_transfer":
      return "Bank transfer";
    case "wallet":
      return "Wallet";
    default:
      return method;
  }
}

export function formatOptionSnapshot(raw: Record<string, unknown> | null | undefined): string {
  if (!raw || typeof raw !== "object") return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(raw)) {
    if (v == null || v === "") continue;
    const val = typeof v === "string" || typeof v === "number" ? String(v) : JSON.stringify(v);
    parts.push(`${k}: ${val}`);
  }
  return parts.join(" · ");
}
