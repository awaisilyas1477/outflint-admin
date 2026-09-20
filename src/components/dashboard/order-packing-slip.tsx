import { useEffect, useState } from "react";
import QRCode from "qrcode";
import type { OrderItemRow, OrderRow, PaymentMethod } from "@/lib/supabase/orders";
import { APP_LOGO_SRC } from "@/config/brand";
import { formatMinorUnits } from "@/lib/format-money";
import { formatOptionSnapshot } from "@/lib/order-lanes";

export type PackingSlipStoreInfo = {
  storeName: string;
  supportPhone?: string;
  supportEmail?: string;
};

type OrderPackingSlipProps = {
  order: OrderRow;
  items: OrderItemRow[];
  store?: PackingSlipStoreInfo;
};

const BRAND = "#c45c2a";

function formatPaymentLabel(method: PaymentMethod): string {
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

function packingSlipQrUrl(orderId: string): string {
  const origin =
    typeof window !== "undefined"
      ? window.location.origin
      : "https://admin.simplecartstore.com";
  return `${origin}/dashboard/orders/${orderId}`;
}

const labelStyle: React.CSSProperties = {
  fontSize: "7.5pt",
  fontWeight: 800,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#555",
  marginBottom: "4px",
};

/**
 * Wide packing slip:
 * - Large logo left, store + phone right
 * - Order number on its own row below
 * - Spacious sections; QR + email at bottom
 */
export function OrderPackingSlip({ order, items, store }: OrderPackingSlipProps) {
  const ref = order.order_number ?? order.id.slice(0, 8).toUpperCase();
  const customerName = [order.first_name, order.last_name].filter(Boolean).join(" ") || "—";
  const storeName = store?.storeName?.trim() || "SimpleCart Store";
  const logoSrc =
    typeof window !== "undefined" ? `${window.location.origin}${APP_LOGO_SRC}` : APP_LOGO_SRC;
  const addressLines = [
    order.shipping_street,
    [order.shipping_city, order.shipping_province].filter(Boolean).join(", "),
    order.shipping_postal_code,
  ].filter(Boolean);
  const qrTarget = packingSlipQrUrl(order.id);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toDataURL(qrTarget, {
      width: 200,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#111", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [qrTarget]);

  return (
    <div id="order-packing-slip" className="hidden print:block">
      <style>{`
        @media print {
          @page { margin: 10mm; size: A4; }
          body * { visibility: hidden; }
          #order-packing-slip, #order-packing-slip * { visibility: visible; }
          #order-packing-slip {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            box-sizing: border-box;
            font-family: "Segoe UI", "Helvetica Neue", Arial, sans-serif;
            font-size: 11pt;
            font-weight: 600;
            line-height: 1.35;
            color: #111;
            background: #fff;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
        }
      `}</style>

      <div style={{ position: "relative" }}>
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: "50%",
            top: "48%",
            transform: "translate(-50%, -50%) rotate(-26deg)",
            fontSize: "42pt",
            fontWeight: 900,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: BRAND,
            opacity: 0.09,
            border: `3.5px solid ${BRAND}`,
            borderRadius: "8px",
            padding: "16px 32px",
            whiteSpace: "nowrap",
            pointerEvents: "none",
            zIndex: 0,
            lineHeight: 1,
          }}
        >
          {storeName}
        </div>

        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Brand band: logo LEFT · store + phone RIGHT */}
          <header
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              width: "100%",
              gap: "28px",
              marginBottom: "14px",
              paddingBottom: "12px",
              borderBottom: `3px solid ${BRAND}`,
            }}
          >
            <img
              src={logoSrc}
              alt={storeName}
              style={{
                height: "120px",
                width: "auto",
                maxWidth: "48%",
                objectFit: "contain",
                objectPosition: "left top",
                display: "block",
              }}
            />

            <div style={{ textAlign: "right", flex: "0 0 auto", maxWidth: "48%", paddingTop: "4px" }}>
              <div
                style={{
                  fontSize: "20pt",
                  fontWeight: 900,
                  lineHeight: 1.15,
                  letterSpacing: "-0.02em",
                  color: "#0a0a0a",
                }}
              >
                {storeName}
              </div>
              {store?.supportPhone ? (
                <div
                  style={{
                    marginTop: "6px",
                    fontSize: "13pt",
                    fontWeight: 800,
                    color: "#1a1a1a",
                    letterSpacing: "0.01em",
                  }}
                >
                  {store.supportPhone}
                </div>
              ) : null}
              <div
                style={{
                  marginTop: "6px",
                  fontSize: "8pt",
                  fontWeight: 800,
                  letterSpacing: "0.16em",
                  textTransform: "uppercase",
                  color: BRAND,
                }}
              >
                Packing slip
              </div>
            </div>
          </header>

          {/* Order number */}
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: "16px",
              marginBottom: "16px",
              paddingBottom: "10px",
              borderBottom: "2px solid #222",
            }}
          >
            <div>
              <div style={labelStyle}>Order number</div>
              <div
                style={{
                  fontSize: "24pt",
                  fontWeight: 900,
                  fontFamily: "ui-monospace, Consolas, monospace",
                  letterSpacing: "-0.02em",
                  lineHeight: 1.1,
                  color: "#0a0a0a",
                }}
              >
                #{ref}
              </div>
            </div>
            <div
              style={{
                textAlign: "right",
                color: "#222",
                fontSize: "11.5pt",
                fontWeight: 700,
              }}
            >
              {new Date(order.created_at).toLocaleDateString(undefined, {
                weekday: "short",
                year: "numeric",
                month: "short",
                day: "numeric",
              })}
            </div>
          </div>

          {/* Customer + payment */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              columnGap: "40px",
              marginBottom: "18px",
            }}
          >
            <div>
              <div style={{ marginBottom: "10px" }}>
                <div style={{ ...labelStyle, marginBottom: "3px" }}>Name</div>
                <div style={{ fontSize: "15pt", fontWeight: 900, color: "#0a0a0a" }}>
                  {customerName}
                </div>
              </div>
              <div style={{ marginBottom: "10px" }}>
                <div style={{ ...labelStyle, marginBottom: "3px" }}>Phone</div>
                <div style={{ fontSize: "13pt", fontWeight: 800, color: "#111" }}>
                  {order.phone?.trim() || "—"}
                </div>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom: "3px" }}>Address</div>
                {addressLines.length > 0 ? (
                  addressLines.map((line) => (
                    <div
                      key={line}
                      style={{
                        color: "#1a1a1a",
                        marginBottom: "3px",
                        fontSize: "12pt",
                        fontWeight: 700,
                      }}
                    >
                      {line}
                    </div>
                  ))
                ) : (
                  <div style={{ color: "#1a1a1a", fontWeight: 700 }}>—</div>
                )}
              </div>
            </div>

            <div>
              <div style={{ marginBottom: "10px" }}>
                <div style={{ ...labelStyle, marginBottom: "3px" }}>Payment</div>
                <div style={{ fontWeight: 800, fontSize: "13pt", color: "#111" }}>
                  {formatPaymentLabel(order.payment_method)}
                </div>
              </div>
              <div>
                <div style={{ ...labelStyle, marginBottom: "3px" }}>Total</div>
                <div style={{ fontSize: "17pt", fontWeight: 900, color: "#0a0a0a" }}>
                  {formatMinorUnits(order.total_cents, order.currency)}
                </div>
              </div>
            </div>
          </div>

          {order.customer_note ? (
            <div
              style={{
                marginBottom: "16px",
                fontSize: "11pt",
                color: "#222",
                fontWeight: 600,
              }}
            >
              <span style={{ fontWeight: 900, color: "#0a0a0a" }}>Note: </span>
              {order.customer_note}
            </div>
          ) : null}

          {/* Items */}
          <div style={{ marginBottom: "16px" }}>
            <div style={{ ...labelStyle, marginBottom: "8px", color: BRAND }}>Items</div>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "12pt",
                fontWeight: 600,
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: "left",
                      borderBottom: "2px solid #222",
                      padding: "0 12px 8px 0",
                      fontWeight: 800,
                      color: "#333",
                      fontSize: "8pt",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                    }}
                  >
                    Product
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      borderBottom: "2px solid #222",
                      padding: "0 12px 8px",
                      fontWeight: 800,
                      color: "#333",
                      fontSize: "8pt",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      width: "64px",
                    }}
                  >
                    Qty
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      borderBottom: "2px solid #222",
                      padding: "0 0 8px 12px",
                      fontWeight: 800,
                      color: "#333",
                      fontSize: "8pt",
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      width: "110px",
                    }}
                  >
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((line) => {
                  const opts = formatOptionSnapshot(line.option_values_snapshot);
                  return (
                    <tr key={line.id}>
                      <td
                        style={{
                          padding: "8px 12px 8px 0",
                          borderBottom: "1.5px solid #ddd",
                          verticalAlign: "top",
                        }}
                      >
                        <div style={{ fontWeight: 800, color: "#0a0a0a" }}>
                          {line.product_name_snapshot}
                        </div>
                        {opts ? (
                          <div
                            style={{
                              fontSize: "9.5pt",
                              color: "#444",
                              marginTop: "2px",
                              fontWeight: 700,
                            }}
                          >
                            {opts}
                          </div>
                        ) : null}
                        {line.sku_snapshot ? (
                          <div
                            style={{
                              fontSize: "9pt",
                              color: "#666",
                              marginTop: "2px",
                              fontWeight: 700,
                            }}
                          >
                            SKU {line.sku_snapshot}
                          </div>
                        ) : null}
                      </td>
                      <td
                        style={{
                          padding: "8px 12px",
                          borderBottom: "1.5px solid #ddd",
                          textAlign: "center",
                          verticalAlign: "top",
                          fontWeight: 900,
                          fontSize: "13pt",
                          color: "#0a0a0a",
                        }}
                      >
                        {line.quantity}
                      </td>
                      <td
                        style={{
                          padding: "8px 0 8px 12px",
                          borderBottom: "1.5px solid #ddd",
                          textAlign: "right",
                          verticalAlign: "top",
                          fontWeight: 800,
                          color: "#111",
                        }}
                      >
                        {formatMinorUnits(line.line_subtotal_cents, order.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div style={{ maxWidth: "280px", marginLeft: "auto", marginBottom: "18px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "5px",
                color: "#333",
                fontWeight: 700,
                fontSize: "11pt",
              }}
            >
              <span>Subtotal</span>
              <span style={{ color: "#111", fontWeight: 800 }}>
                {formatMinorUnits(order.subtotal_cents, order.currency)}
              </span>
            </div>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "5px",
                color: "#333",
                fontWeight: 700,
                fontSize: "11pt",
              }}
            >
              <span>Shipping</span>
              <span style={{ color: "#111", fontWeight: 800 }}>
                {formatMinorUnits(order.shipping_cents, order.currency)}
              </span>
            </div>
            {order.discount_cents > 0 ? (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "5px",
                  color: "#333",
                  fontWeight: 700,
                  fontSize: "11pt",
                }}
              >
                <span>Discount</span>
                <span style={{ color: "#111", fontWeight: 800 }}>
                  −{formatMinorUnits(order.discount_cents, order.currency)}
                </span>
              </div>
            ) : null}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: "8px",
                paddingTop: "8px",
                borderTop: `3px solid ${BRAND}`,
                fontWeight: 900,
                fontSize: "14pt",
                color: "#0a0a0a",
              }}
            >
              <span>Total</span>
              <span>{formatMinorUnits(order.total_cents, order.currency)}</span>
            </div>
          </div>

          {/* QR + email at bottom */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              paddingTop: "12px",
              borderTop: "2px solid #222",
            }}
          >
            <div>
              <div style={{ ...labelStyle, marginBottom: "3px", color: BRAND }}>Scan order</div>
              <div style={{ fontSize: "10pt", color: "#333", fontWeight: 700 }}>
                Open this order in admin
              </div>
              {store?.supportEmail ? (
                <div
                  style={{
                    marginTop: "8px",
                    fontSize: "11pt",
                    color: "#111",
                    fontWeight: 800,
                  }}
                >
                  {store.supportEmail}
                </div>
              ) : null}
            </div>
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt={`QR for order ${ref}`}
                width={148}
                height={148}
                style={{
                  display: "block",
                  width: 148,
                  height: 148,
                  border: "2px solid #222",
                  borderRadius: "6px",
                  padding: "4px",
                  background: "#fff",
                }}
              />
            ) : (
              <div
                style={{
                  width: 148,
                  height: 148,
                  border: "2px solid #222",
                  borderRadius: "6px",
                  background: "#f7f7f7",
                }}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function printOrderPackingSlip(): void {
  window.print();
}
