import type { VoucherBatchStatsRow } from "@/lib/supabase/vouchers";

/** UI tier: shared / multi batch / single assigned customer (internal keys only). */
export type VoucherTier = "t1" | "t2" | "t3";

/**
 * Infer list/filter tier from stats (no extra DB column).
 * - Shared promo: one shared code for everyone (once each).
 * - Unique batch: multi batch — pool of codes, many codes, or deferred rules.
 * - Customer-specific: exactly one code in the batch and it is assigned to a customer (not in the unassigned pool).
 *   After redemption, the row may show as batch until stats reflect a single used code (acceptable).
 */
export function inferVoucherTier(row: VoucherBatchStatsRow): VoucherTier {
  if (row.batch_kind === "shared") return "t1";

  const total = row.total_codes ?? 0;
  const unassigned = row.unassigned_available_count ?? 0;
  const assignedOpen = row.assigned_not_redeemed_count ?? 0;

  if (total === 1 && unassigned === 0 && assignedOpen >= 1) {
    return "t3";
  }
  return "t2";
}

export type VoucherTierLabels = {
  /** Primary label for badges and tables */
  title: string;
  /** Short label for summary chips (e.g. "Shared") */
  shortLabel: string;
  description: string;
};

export function voucherTierLabel(tier: VoucherTier): VoucherTierLabels {
  switch (tier) {
    case "t1":
      return {
        title: "Shared promo code",
        shortLabel: "Shared",
        description: "One code; each logged-in customer may use once.",
      };
    case "t2":
      return {
        title: "Unique code batch",
        shortLabel: "Batch",
        description: "Many unique codes (or one code in the pool). Prefix + random.",
      };
    case "t3":
      return {
        title: "Customer-specific code",
        shortLabel: "Dedicated",
        description: "A single code created for one shopper.",
      };
    default:
      return { title: "Voucher", shortLabel: "—", description: "" };
  }
}

/** Machine-readable slug for exports (not "type 1/2/3"). */
export function voucherTierExportSlug(tier: VoucherTier): string {
  switch (tier) {
    case "t1":
      return "shared_promo";
    case "t2":
      return "unique_batch";
    case "t3":
      return "customer_specific";
    default:
      return "unknown";
  }
}

export function voucherTierBadgeClass(tier: VoucherTier): string {
  switch (tier) {
    case "t1":
      return "border-violet-300 bg-violet-50 text-violet-900 dark:border-violet-700 dark:bg-violet-950/50 dark:text-violet-100";
    case "t2":
      return "border-sky-300 bg-sky-50 text-sky-900 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-100";
    case "t3":
      return "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100";
    default:
      return "";
  }
}
