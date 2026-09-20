/** Checkout currently settles delivery in PKR only; other codes are for future use. */
export const DELIVERY_CURRENCY_OPTIONS = [
  { value: "PKR", label: "PKR" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
] as const;

export type DeliveryCurrencyCode = (typeof DELIVERY_CURRENCY_OPTIONS)[number]["value"];
