import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MessageCircle, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/dashboard/page-header";
import {
  AdminListCard,
  AdminListEmpty,
  AdminListSkeleton,
  ADMIN_LIST_PAGE_CLASS,
  TableContainer,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW,
  adminTh,
  adminTd,
} from "@/components/dashboard/admin-list-shell";
import { Button } from "@/components/ui/button";
import { fetchAbandonedCartsAdmin } from "@/lib/supabase/carts-admin";
import { formatMinorUnits } from "@/lib/format-money";
import { buildWhatsAppUrl } from "@/lib/whatsapp";
import { toast } from "sonner";

function cartFollowUpMessage(name: string, totalPkr: string): string {
  const greeting = name && name !== "—" ? `Hi ${name}` : "Hi";
  return `${greeting}, you still have items in your cart (approx. ${totalPkr}). Need help completing your order?`;
}

export function AbandonedCartsPage() {
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchAbandonedCartsAdmin>>>([]);
  const [loading, setLoading] = useState(true);

  const cartTotalsByUser = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rows) {
      const line = Math.round(r.unit_price * 100) * r.quantity;
      map.set(r.user_id, (map.get(r.user_id) ?? 0) + line);
    }
    return map;
  }, [rows]);

  useEffect(() => {
    void fetchAbandonedCartsAdmin(300).then((data) => {
      setRows(data);
      setLoading(false);
    });
  }, []);

  function onWhatsApp(r: (typeof rows)[number]) {
    const totalCents = cartTotalsByUser.get(r.user_id) ?? 0;
    const totalLabel = formatMinorUnits(totalCents, "PKR");
    const url = buildWhatsAppUrl(r.customer_phone, cartFollowUpMessage(r.customer_name, totalLabel));
    if (!url) {
      toast.error("No valid phone for this customer.");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Abandoned carts"
        description="Items still in customer carts — useful for follow-up or support."
      />

      <AdminListCard
        title="Open carts"
        description={`${rows.length} cart line${rows.length === 1 ? "" : "s"} in the database.`}
      >
        {loading ? (
          <AdminListSkeleton rows={5} />
        ) : rows.length === 0 ? (
          <AdminListEmpty icon={ShoppingCart}>No cart items found.</AdminListEmpty>
        ) : (
          <TableContainer>
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead>
                <tr className={ADMIN_TABLE_HEAD}>
                  <th className={adminTh()}>Customer</th>
                  <th className={adminTh()}>Phone</th>
                  <th className={adminTh()}>Cart total</th>
                  <th className={adminTh()}>Product</th>
                  <th className={adminTh()}>SKU</th>
                  <th className={adminTh()}>Qty</th>
                  <th className={adminTh()}>Unit price</th>
                  <th className={adminTh()}>Last updated</th>
                  <th className={adminTh()} />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cartTotalCents = cartTotalsByUser.get(r.user_id) ?? 0;
                  return (
                    <tr key={r.id} className={ADMIN_TABLE_ROW}>
                      <td className={adminTd()}>
                        <Link
                          to={`/dashboard/customers/${r.user_id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {r.customer_name}
                        </Link>
                      </td>
                      <td className={adminTd("tabular-nums")}>{r.customer_phone}</td>
                      <td className={adminTd("tabular-nums font-medium")}>
                        {formatMinorUnits(cartTotalCents, "PKR")}
                      </td>
                      <td className={adminTd()}>
                        <Link
                          to={`/dashboard/products/${r.product_id}`}
                          className="hover:text-primary hover:underline"
                        >
                          {r.product_name}
                        </Link>
                      </td>
                      <td className={adminTd("font-mono text-xs")}>{r.variant_sku}</td>
                      <td className={adminTd("tabular-nums")}>{r.quantity}</td>
                      <td className={adminTd("tabular-nums")}>
                        {formatMinorUnits(Math.round(r.unit_price * 100), "PKR")}
                      </td>
                      <td className={adminTd("text-muted-foreground")}>
                        {new Date(r.updated_at).toLocaleString()}
                      </td>
                      <td className={adminTd()}>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-primary"
                          onClick={() => onWhatsApp(r)}
                        >
                          <MessageCircle className="mr-1.5 h-4 w-4" />
                          WhatsApp
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableContainer>
        )}
      </AdminListCard>
    </div>
  );
}
