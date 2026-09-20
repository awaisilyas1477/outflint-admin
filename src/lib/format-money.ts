/** Amounts are stored in minor units (e.g. ×100 PKR); this formats for display in rupees. */
export function formatMinorUnits(
  minorUnits: number,
  currency: string,
  locale = "en-PK",
): string {
  const major = minorUnits / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: currency || "PKR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(major);
  } catch {
    return `${currency || "PKR"} ${major.toLocaleString(locale, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }
}
