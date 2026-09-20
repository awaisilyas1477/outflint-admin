import type { OrderItemRow, OrderRow } from "@/lib/supabase/orders";
import { formatMinorUnits } from "@/lib/format-money";
import { formatOrderStatus } from "@/lib/order-status";
import { formatOptionSnapshot, formatPaymentMethod } from "@/lib/order-lanes";

/** Staff / courier clipboard summary (not customer-facing). */
export function formatOrderDispatchText(
  order: OrderRow,
  items: OrderItemRow[] = [],
): string {
  const ref = order.order_number ?? order.id.slice(0, 8);
  const name = [order.first_name, order.last_name].filter(Boolean).join(" ") || "—";
  const address = [
    order.shipping_street,
    [order.shipping_city, order.shipping_province, order.shipping_postal_code]
      .filter(Boolean)
      .join(", "),
  ]
    .filter(Boolean)
    .join("\n");

  const lines: string[] = [
    `Order: ${ref}`,
    `Status: ${formatOrderStatus(order.status)}`,
    `Name: ${name}`,
    `Phone: ${order.phone || "—"}`,
    `Email: ${order.email || "—"}`,
    `Address:\n${address || "—"}`,
  ];

  if (items.length > 0) {
    lines.push("", "Items:");
    for (const line of items) {
      const img = line.primary_image_url_snapshot?.trim();
      lines.push(
        `• ${line.product_name_snapshot} × ${line.quantity} (${line.sku_snapshot}) — ${formatMinorUnits(line.line_subtotal_cents, order.currency)}`,
      );
      if (img) {
        lines.push(`  Photo: ${img}`);
      }
    }
  }

  lines.push(
    "",
    `Total: ${formatMinorUnits(order.total_cents, order.currency)} (${order.payment_method.toUpperCase()})`,
  );

  if (order.customer_note) {
    lines.push("", `Customer note: ${order.customer_note}`);
  }

  return lines.join("\n");
}

/**
 * Customer-facing WhatsApp confirmation (Yes / No reply).
 * Plain text only — no emojis (avoid encoding issues in some WhatsApp clients).
 * Note: wa.me cannot create interactive WhatsApp polls — reply Yes/No is the workable UX.
 */
export function formatOrderWhatsAppConfirmation(
  order: OrderRow,
  items: OrderItemRow[] = [],
  storeName = "SimpleCart Store",
): string {
  const first = (order.first_name || "").trim() || "there";
  const cityLine = [order.shipping_city, order.shipping_province].filter(Boolean).join(", ");

  const lines: string[] = [
    `Assalam o Alaikum ${first},`,
    "",
    `${storeName} — please confirm this order:`,
  ];

  if (items.length > 0) {
    lines.push("");
    for (const line of items) {
      const opts = formatOptionSnapshot(line.option_values_snapshot);
      const price = formatMinorUnits(line.line_subtotal_cents, order.currency);
      const itemLine = opts
        ? `- ${line.product_name_snapshot} (${opts}) x${line.quantity} — ${price}`
        : `- ${line.product_name_snapshot} x${line.quantity} — ${price}`;
      lines.push(itemLine);
    }
  }

  lines.push(
    "",
    `Total: ${formatMinorUnits(order.total_cents, order.currency)} (${formatPaymentMethod(order.payment_method)})`,
  );

  if (cityLine) {
    lines.push(`City: ${cityLine}`);
  }

  lines.push(
    "",
    "Reply YES to confirm, or NO to cancel.",
  );

  return lines.join("\n");
}

export function formatOrderListCopyText(order: OrderRow): string {
  const ref = order.order_number ?? order.id.slice(0, 8);
  const name = [order.first_name, order.last_name].filter(Boolean).join(" ") || "—";
  const city = [order.shipping_city, order.shipping_province].filter(Boolean).join(", ");
  return [
    `Order ${ref}`,
    name,
    order.phone || "—",
    city || "—",
    formatMinorUnits(order.total_cents, order.currency),
  ].join(" | ");
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
