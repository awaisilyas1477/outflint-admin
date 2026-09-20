import { formatMinorUnits } from "@/lib/format-money";
import { csvEscape, downloadCsv } from "@/lib/download-csv";
import type { OrderRow } from "@/lib/supabase/orders";

export function exportOrdersCsv(rows: OrderRow[], filename = "orders-export.csv"): void {
  const headers = [
    "order_number",
    "status",
    "email",
    "phone",
    "first_name",
    "last_name",
    "shipping_street",
    "shipping_city",
    "shipping_province",
    "shipping_postal_code",
    "subtotal",
    "shipping",
    "discount",
    "total",
    "currency",
    "payment_method",
    "placed_at",
  ];
  const lines = [
    headers.join(","),
    ...rows.map((o) =>
      [
        csvEscape(o.order_number ?? o.id.slice(0, 8)),
        csvEscape(o.status),
        csvEscape(o.email),
        csvEscape(o.phone),
        csvEscape(o.first_name),
        csvEscape(o.last_name),
        csvEscape(o.shipping_street),
        csvEscape(o.shipping_city),
        csvEscape(o.shipping_province),
        csvEscape(o.shipping_postal_code),
        csvEscape(formatMinorUnits(o.subtotal_cents, o.currency)),
        csvEscape(formatMinorUnits(o.shipping_cents, o.currency)),
        csvEscape(formatMinorUnits(o.discount_cents, o.currency)),
        csvEscape(formatMinorUnits(o.total_cents, o.currency)),
        csvEscape(o.currency),
        csvEscape(o.payment_method),
        csvEscape(new Date(o.created_at).toISOString()),
      ].join(","),
    ),
  ];
  downloadCsv(filename, lines.join("\n"));
}
