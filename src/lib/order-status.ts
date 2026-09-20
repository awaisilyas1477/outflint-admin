import type { OrderStatus } from "@/lib/supabase/orders";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  paid: "Paid",
  processing: "Processing",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

export function orderStatusVariant(
  status: string,
): "default" | "secondary" | "outline" | "success" | "destructive" | "warning" {
  if (status === "delivered" || status === "paid") return "success";
  if (status === "cancelled" || status === "refunded") return "destructive";
  if (status === "pending") return "secondary";
  if (status === "processing" || status === "shipped") return "warning";
  return "outline";
}

export function formatOrderStatus(status: string): string {
  if (status in ORDER_STATUS_LABELS) {
    return ORDER_STATUS_LABELS[status as OrderStatus];
  }
  return status;
}
