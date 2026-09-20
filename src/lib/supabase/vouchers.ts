import { supabase } from "@/lib/supabase/client";

import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
function logErr(op: string, message: string | undefined) {
  if (!message) return;
  console.error(`[vouchers] ${op}`, message);
}

const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length = 12): string {
  let s = "";
  const buf = new Uint32Array(length);
  crypto.getRandomValues(buf);
  for (let i = 0; i < length; i++) {
    s += CODE_CHARS[buf[i]! % CODE_CHARS.length];
  }
  return s;
}

export type VoucherBatchKind = "shared" | "multi";

export type VoucherBatchStatus = "draft" | "active" | "paused" | "archived";

export type VoucherBatchStatsRow = {
  id: string;
  name: string;
  batch_kind: VoucherBatchKind;
  shared_code: string | null;
  /** Null for multi batches that defer rules to per-code overrides. */
  discount_type: "fixed" | "percentage" | null;
  voucher_amount: number | null;
  product_scope: "all" | "specific";
  product_ids: string[];
  min_order_amount: number;
  valid_from: string | null;
  valid_until: string | null;
  created_at: string;
  updated_at: string;
  status?: VoucherBatchStatus;
  campaign_purpose: string | null;
  attribution_source: string | null;
  code_prefix: string | null;
  code_random_length: number | null;
  max_discount_cents: number | null;
  total_codes: number;
  used_count: number;
  available_count: number | null;
  unassigned_available_count: number | null;
  assigned_not_redeemed_count: number | null;
};

export type VoucherInstanceRow = {
  id: string;
  batch_id: string;
  code: string;
  voucher_label: string | null;
  assigned_public_user_id: string | null;
  redeemed_at: string | null;
  order_id: string | null;
  created_at: string;
  override_discount_type: string | null;
  override_voucher_amount: number | null;
  override_min_order_amount: number | null;
  override_valid_from: string | null;
  override_valid_until: string | null;
  override_product_scope: string | null;
  override_product_ids: string[] | null;
};

/** Multi batches may omit discount & validity (nulls); shared batches must send full rules. */
export type VoucherBatchWritePayload = {
  name: string;
  discount_type: "fixed" | "percentage" | null;
  voucher_amount: number | null;
  product_scope: "all" | "specific";
  product_ids: string[];
  min_order_amount: number;
  valid_from: string | null;
  valid_until: string | null;
  status?: VoucherBatchStatus;
  campaign_purpose?: string | null;
  attribution_source?: string | null;
  code_prefix?: string | null;
  code_random_length?: number | null;
  max_discount_cents?: number | null;
};

export type InstanceOverridePayload = {
  override_discount_type: "fixed" | "percentage" | null;
  override_voucher_amount: number | null;
  override_min_order_amount: number | null;
  override_valid_from: string | null;
  override_valid_until: string | null;
  override_product_scope: "all" | "specific" | null;
  override_product_ids: string[] | null;
};

export function emptyInstanceOverrides(): InstanceOverridePayload {
  return {
    override_discount_type: null,
    override_voucher_amount: null,
    override_min_order_amount: null,
    override_valid_from: null,
    override_valid_until: null,
    override_product_scope: null,
    override_product_ids: null,
  };
}

export type PublicUserOption = {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
};

export type ProductOption = {
  id: string;
  name: string;
};

export async function fetchVoucherBatches(): Promise<VoucherBatchStatsRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("voucher_batch_stats")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) {
    logErr("fetchVoucherBatches", error.message);
    return [];
  }
  return (data ?? []).map((r) => {
    const row = r as Record<string, unknown>;
    return {
      ...(r as VoucherBatchStatsRow),
      discount_type: (row.discount_type as VoucherBatchStatsRow["discount_type"]) ?? null,
      voucher_amount: (row.voucher_amount as number | null | undefined) ?? null,
      valid_from: (row.valid_from as string | null | undefined) ?? null,
      valid_until: (row.valid_until as string | null | undefined) ?? null,
      product_ids: Array.isArray(row.product_ids) ? (row.product_ids as string[]) : [],
      batch_kind: ((row.batch_kind as string) ?? "multi") as VoucherBatchKind,
      shared_code: (row.shared_code as string | null) ?? null,
      status: (row.status as VoucherBatchStatsRow["status"]) ?? "active",
      campaign_purpose: (row.campaign_purpose as string | null | undefined) ?? null,
      attribution_source: (row.attribution_source as string | null | undefined) ?? null,
      code_prefix: (row.code_prefix as string | null | undefined) ?? null,
      code_random_length: (row.code_random_length as number | null | undefined) ?? null,
      max_discount_cents: (row.max_discount_cents as number | null | undefined) ?? null,
    };
  });
}

export async function fetchVoucherBatchStatsById(id: string): Promise<VoucherBatchStatsRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("voucher_batch_stats").select("*").eq("id", id).maybeSingle();
  if (error) {
    logErr("fetchVoucherBatchStatsById", error.message);
    return null;
  }
  if (!data) return null;
  const r = data as Record<string, unknown>;
  return {
    ...(data as VoucherBatchStatsRow),
    discount_type: (r.discount_type as VoucherBatchStatsRow["discount_type"]) ?? null,
    voucher_amount: (r.voucher_amount as number | null | undefined) ?? null,
    valid_from: (r.valid_from as string | null | undefined) ?? null,
    valid_until: (r.valid_until as string | null | undefined) ?? null,
    product_ids: Array.isArray(r.product_ids) ? (r.product_ids as string[]) : [],
    batch_kind: ((r.batch_kind as string) ?? "multi") as VoucherBatchKind,
    shared_code: (r.shared_code as string | null) ?? null,
    status: (r.status as VoucherBatchStatsRow["status"]) ?? "active",
    campaign_purpose: (r.campaign_purpose as string | null | undefined) ?? null,
    attribution_source: (r.attribution_source as string | null | undefined) ?? null,
    code_prefix: (r.code_prefix as string | null | undefined) ?? null,
    code_random_length: (r.code_random_length as number | null | undefined) ?? null,
    max_discount_cents: (r.max_discount_cents as number | null | undefined) ?? null,
  };
}

export async function fetchVoucherInstancesByPublicUserId(
  publicUserId: string,
  limit = 80,
): Promise<VoucherInstanceRow[]> {
  if (!supabase) return [];
  const cap = Math.min(limit, 200);
  const { data, error } = await supabase
    .from("voucher_instances")
    .select(
      "id, batch_id, code, voucher_label, assigned_public_user_id, redeemed_at, order_id, created_at, override_discount_type, override_voucher_amount, override_min_order_amount, override_valid_from, override_valid_until, override_product_scope, override_product_ids",
    )
    .eq("assigned_public_user_id", publicUserId)
    .order("created_at", { ascending: false })
    .limit(cap);
  if (error) {
    logErr("fetchVoucherInstancesByPublicUserId", error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      ...(row as VoucherInstanceRow),
      voucher_label: (r.voucher_label as string | null | undefined) ?? null,
      override_product_ids: Array.isArray(r.override_product_ids)
        ? (r.override_product_ids as string[])
        : null,
    };
  });
}

export async function fetchVoucherInstances(batchId: string): Promise<VoucherInstanceRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("voucher_instances")
    .select(
      "id, batch_id, code, voucher_label, assigned_public_user_id, redeemed_at, order_id, created_at, override_discount_type, override_voucher_amount, override_min_order_amount, override_valid_from, override_valid_until, override_product_scope, override_product_ids",
    )
    .eq("batch_id", batchId)
    .order("created_at", { ascending: true });
  if (error) {
    logErr("fetchVoucherInstances", error.message);
    return [];
  }
  return (data ?? []).map((row) => {
    const r = row as Record<string, unknown>;
    return {
      ...(row as VoucherInstanceRow),
      voucher_label: (r.voucher_label as string | null | undefined) ?? null,
      override_product_ids: Array.isArray(r.override_product_ids)
        ? (r.override_product_ids as string[])
        : null,
    };
  });
}

export async function fetchProductsForVoucherPicker(): Promise<ProductOption[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("products")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) {
    logErr("fetchProductsForVoucherPicker", error.message);
    return [];
  }
  return (data ?? []) as ProductOption[];
}

export async function fetchPublicUsersForAssign(limit = 400): Promise<PublicUserOption[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("users")
    .select("id, first_name, last_name, phone")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logErr("fetchPublicUsersForAssign", error.message);
    return [];
  }
  return (data ?? []) as PublicUserOption[];
}

function normalizeCodePrefix(raw: string | null | undefined): string {
  if (raw == null || raw === "") return "";
  return raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

async function collectUniqueCodes(
  needed: number,
  prefixRaw: string | null | undefined,
  randomLength: number,
): Promise<string[]> {
  if (!supabase) throw new Error("No client");
  const prefix = normalizeCodePrefix(prefixRaw);
  const len = Math.min(32, Math.max(4, Math.floor(randomLength) || 12));
  const result: string[] = [];
  const have = new Set<string>();
  let guard = 0;
  while (result.length < needed && guard < 500) {
    guard++;
    const want = Math.min(80, needed - result.length + 10);
    const candidates: string[] = [];
    while (candidates.length < want) {
      const c = prefix + randomCode(len);
      if (have.has(c)) continue;
      have.add(c);
      candidates.push(c);
    }
    const { data } = await supabase.from("voucher_instances").select("code").in("code", candidates);
    const taken = new Set((data ?? []).map((r) => (r as { code: string }).code));
    for (const c of candidates) {
      if (!taken.has(c) && result.length < needed) {
        result.push(c);
      } else if (taken.has(c)) {
        have.delete(c);
      }
    }
  }
  return result;
}

/** One shared code: every customer may redeem once; rules live on the batch. */
export async function createSharedVoucherBatch(
  payload: VoucherBatchWritePayload,
  sharedCode: string,
): Promise<{ batchId: string; error?: string }> {
  if (!supabase) {
    return { batchId: "", error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const code = sharedCode.trim().replace(/[^a-zA-Z0-9]/g, "");
  if (!code || !/^[a-zA-Z0-9]+$/.test(code)) {
    return { batchId: "", error: "Shared code must be alphanumeric." };
  }
  if (
    payload.discount_type == null ||
    payload.voucher_amount == null ||
    !payload.valid_from ||
    !payload.valid_until
  ) {
    return { batchId: "", error: "Shared vouchers require discount, validity, and product scope." };
  }
  if (payload.discount_type === "percentage" && (payload.voucher_amount <= 0 || payload.voucher_amount > 100)) {
    return { batchId: "", error: "Percentage must be between 1 and 100." };
  }
  if (payload.product_scope === "specific" && payload.product_ids.length < 1) {
    return { batchId: "", error: "Select at least one product, or choose All products." };
  }

  const row = {
    name: payload.name.trim() || "Shared voucher",
    batch_kind: "shared" as const,
    shared_code: code.toUpperCase(),
    discount_type: payload.discount_type,
    voucher_amount: payload.voucher_amount,
    product_scope: payload.product_scope,
    product_ids: payload.product_scope === "specific" ? payload.product_ids : [],
    min_order_amount: payload.min_order_amount,
    valid_from: payload.valid_from,
    valid_until: payload.valid_until,
    status: payload.status ?? "active",
    campaign_purpose: payload.campaign_purpose?.trim() || null,
    attribution_source: payload.attribution_source?.trim() || null,
    max_discount_cents: payload.max_discount_cents ?? null,
  };

  const { data, error } = await supabase.from("voucher_batches").insert(row).select("id").single();
  if (error || !data) {
    return { batchId: "", error: error?.message ?? "Failed to create shared voucher." };
  }
  return { batchId: (data as { id: string }).id };
}

/** Many unique codes; batch rules optional (null) — set per code when assigning. */
export async function createVoucherBatchWithQuantity(
  payload: VoucherBatchWritePayload,
  quantity: number,
): Promise<{ batchId: string; error?: string }> {
  if (!supabase) {
    return { batchId: "", error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  if (quantity < 1 || quantity > 10_000) {
    return { batchId: "", error: "Quantity must be between 1 and 10,000." };
  }

  const deferred = payload.discount_type == null || payload.voucher_amount == null;

  if (!deferred) {
    if (payload.discount_type === "percentage" && (payload.voucher_amount! <= 0 || payload.voucher_amount! > 100)) {
      return { batchId: "", error: "Percentage must be between 1 and 100." };
    }
    if (payload.discount_type === "fixed" && (payload.voucher_amount == null || payload.voucher_amount <= 0)) {
      return { batchId: "", error: "Enter a valid fixed discount amount." };
    }
    if (payload.product_scope === "specific" && payload.product_ids.length < 1) {
      return { batchId: "", error: "Select at least one product, or choose All products." };
    }
    if (!payload.valid_from || !payload.valid_until) {
      return { batchId: "", error: "Valid from and valid until are required when campaign rules are set." };
    }
    if (new Date(payload.valid_until) <= new Date(payload.valid_from)) {
      return { batchId: "", error: "Valid until must be after valid from." };
    }
  }

  const meta = {
    status: payload.status ?? "active",
    campaign_purpose: payload.campaign_purpose?.trim() || null,
    attribution_source: payload.attribution_source?.trim() || null,
    code_prefix: normalizeCodePrefix(payload.code_prefix) || null,
    code_random_length: payload.code_random_length ?? 12,
    max_discount_cents: payload.max_discount_cents ?? null,
  };

  const row = deferred
    ? {
        name: payload.name.trim() || "Voucher campaign",
        batch_kind: "multi" as const,
        discount_type: null as null,
        voucher_amount: null as null,
        product_scope: "all" as const,
        product_ids: [] as string[],
        min_order_amount: payload.min_order_amount ?? 0,
        valid_from: null as null,
        valid_until: null as null,
        ...meta,
      }
    : {
        name: payload.name.trim() || "Voucher campaign",
        batch_kind: "multi" as const,
        discount_type: payload.discount_type!,
        voucher_amount: payload.voucher_amount!,
        product_scope: payload.product_scope,
        product_ids: payload.product_scope === "specific" ? payload.product_ids : [],
        min_order_amount: payload.min_order_amount,
        valid_from: payload.valid_from!,
        valid_until: payload.valid_until!,
        ...meta,
      };

  const { data: batchRow, error: bErr } = await supabase
    .from("voucher_batches")
    .insert(row)
    .select("id")
    .single();
  if (bErr || !batchRow) {
    return { batchId: "", error: bErr?.message ?? "Failed to create batch." };
  }
  const batchId = (batchRow as { id: string }).id;

  try {
    const rndLen = payload.code_random_length ?? 12;
    const codes = await collectUniqueCodes(quantity, payload.code_prefix, rndLen);
    const chunkSize = 150;
    for (let i = 0; i < codes.length; i += chunkSize) {
      const slice = codes.slice(i, i + chunkSize);
      const rows = slice.map((code) => ({ batch_id: batchId, code }));
      const { error: iErr } = await supabase.from("voucher_instances").insert(rows);
      if (iErr) {
        await supabase.from("voucher_batches").delete().eq("id", batchId);
        return { batchId: "", error: iErr.message };
      }
    }
  } catch (e) {
    await supabase.from("voucher_batches").delete().eq("id", batchId);
    return { batchId: "", error: e instanceof Error ? e.message : "Failed to create codes." };
  }

  return { batchId };
}

/**
 * Customer-specific: one unique code in a multi batch, assigned to one customer at creation (not left in the pool).
 * Requires full campaign discount rules (same as a normal multi batch with quantity 1, but pre-assigned).
 */
export async function createSingleCustomerVoucherBatch(
  payload: VoucherBatchWritePayload,
  assigneePublicUserId: string,
): Promise<{ batchId: string; error?: string }> {
  if (!supabase) {
    return { batchId: "", error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const uid = assigneePublicUserId.trim();
  if (!uid) {
    return { batchId: "", error: "Choose a customer to receive this code." };
  }

  const deferred = payload.discount_type == null || payload.voucher_amount == null;
  if (deferred) {
    return {
      batchId: "",
      error: "Single-customer vouchers need full discount and validity rules on this screen.",
    };
  }
  if (payload.discount_type === "percentage" && (payload.voucher_amount! <= 0 || payload.voucher_amount! > 100)) {
    return { batchId: "", error: "Percentage must be between 1 and 100." };
  }
  if (payload.discount_type === "fixed" && (payload.voucher_amount == null || payload.voucher_amount <= 0)) {
    return { batchId: "", error: "Enter a valid fixed discount amount." };
  }
  if (payload.product_scope === "specific" && payload.product_ids.length < 1) {
    return { batchId: "", error: "Select at least one product, or choose All products." };
  }
  if (!payload.valid_from || !payload.valid_until) {
    return { batchId: "", error: "Valid from and valid until are required." };
  }
  if (new Date(payload.valid_until) <= new Date(payload.valid_from)) {
    return { batchId: "", error: "Valid until must be after valid from." };
  }

  const meta = {
    status: payload.status ?? "active",
    campaign_purpose: payload.campaign_purpose?.trim() || null,
    attribution_source: payload.attribution_source?.trim() || null,
    code_prefix: normalizeCodePrefix(payload.code_prefix) || null,
    code_random_length: payload.code_random_length ?? 12,
    max_discount_cents: payload.max_discount_cents ?? null,
  };

  const row = {
    name: payload.name.trim() || "Single-customer voucher",
    batch_kind: "multi" as const,
    discount_type: payload.discount_type!,
    voucher_amount: payload.voucher_amount!,
    product_scope: payload.product_scope,
    product_ids: payload.product_scope === "specific" ? payload.product_ids : [],
    min_order_amount: payload.min_order_amount,
    valid_from: payload.valid_from!,
    valid_until: payload.valid_until!,
    ...meta,
  };

  const { data: batchRow, error: bErr } = await supabase
    .from("voucher_batches")
    .insert(row)
    .select("id")
    .single();
  if (bErr || !batchRow) {
    return { batchId: "", error: bErr?.message ?? "Failed to create batch." };
  }
  const batchId = (batchRow as { id: string }).id;

  try {
    const rndLen = payload.code_random_length ?? 12;
    const codes = await collectUniqueCodes(1, payload.code_prefix, rndLen);
    const code = codes[0];
    if (!code) {
      throw new Error("Could not generate a unique code.");
    }
    const { error: iErr } = await supabase.from("voucher_instances").insert({
      batch_id: batchId,
      code,
      assigned_public_user_id: uid,
    });
    if (iErr) {
      await supabase.from("voucher_batches").delete().eq("id", batchId);
      return { batchId: "", error: iErr.message };
    }
  } catch (e) {
    await supabase.from("voucher_batches").delete().eq("id", batchId);
    return { batchId: "", error: e instanceof Error ? e.message : "Failed to create assigned code." };
  }

  return { batchId };
}

export async function updateVoucherBatch(
  batchId: string,
  payload: VoucherBatchWritePayload,
): Promise<{ error?: string }> {
  if (!supabase) {
    return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }

  const { data: meta, error: metaErr } = await supabase
    .from("voucher_batches")
    .select("batch_kind")
    .eq("id", batchId)
    .maybeSingle();
  if (metaErr || !meta) {
    return { error: metaErr?.message ?? "Batch not found." };
  }
  const kind = (meta as { batch_kind: string }).batch_kind;

  const deferred = payload.discount_type == null || payload.voucher_amount == null;

  if (kind === "shared") {
    if (deferred || !payload.valid_from || !payload.valid_until) {
      return { error: "Shared vouchers require full campaign discount and validity." };
    }
    if (payload.discount_type === "percentage" && (payload.voucher_amount! <= 0 || payload.voucher_amount! > 100)) {
      return { error: "Percentage must be between 1 and 100." };
    }
    if (payload.product_scope === "specific" && payload.product_ids.length < 1) {
      return { error: "Select at least one product, or choose All products." };
    }
    if (new Date(payload.valid_until) <= new Date(payload.valid_from)) {
      return { error: "Valid until must be after valid from." };
    }
  } else {
    if (!deferred) {
      if (payload.discount_type === "percentage" && (payload.voucher_amount! <= 0 || payload.voucher_amount! > 100)) {
        return { error: "Percentage must be between 1 and 100." };
      }
      if (payload.discount_type === "fixed" && (payload.voucher_amount == null || payload.voucher_amount <= 0)) {
        return { error: "Enter a valid fixed discount amount." };
      }
      if (payload.product_scope === "specific" && payload.product_ids.length < 1) {
        return { error: "Select at least one product, or choose All products." };
      }
      if (!payload.valid_from || !payload.valid_until) {
        return { error: "Valid from and valid until are required when campaign rules are set." };
      }
      if (new Date(payload.valid_until) <= new Date(payload.valid_from)) {
        return { error: "Valid until must be after valid from." };
      }
    }
  }

  const row: Record<string, unknown> = deferred
    ? {
        name: payload.name.trim() || "Voucher campaign",
        discount_type: null as null,
        voucher_amount: null as null,
        product_scope: "all" as const,
        product_ids: [] as string[],
        min_order_amount: payload.min_order_amount ?? 0,
        valid_from: null as null,
        valid_until: null as null,
        updated_at: new Date().toISOString(),
      }
    : {
        name: payload.name.trim() || "Voucher campaign",
        discount_type: payload.discount_type!,
        voucher_amount: payload.voucher_amount!,
        product_scope: payload.product_scope,
        product_ids: payload.product_scope === "specific" ? payload.product_ids : [],
        min_order_amount: payload.min_order_amount,
        valid_from: payload.valid_from!,
        valid_until: payload.valid_until!,
        updated_at: new Date().toISOString(),
      };

  if (payload.status !== undefined) row.status = payload.status;
  if (payload.campaign_purpose !== undefined) {
    row.campaign_purpose = payload.campaign_purpose?.trim() || null;
  }
  if (payload.attribution_source !== undefined) {
    row.attribution_source = payload.attribution_source?.trim() || null;
  }
  if (payload.code_prefix !== undefined) {
    row.code_prefix = normalizeCodePrefix(payload.code_prefix) || null;
  }
  if (payload.code_random_length !== undefined) {
    row.code_random_length = payload.code_random_length;
  }
  if (payload.max_discount_cents !== undefined) {
    row.max_discount_cents = payload.max_discount_cents;
  }

  const { error } = await supabase.from("voucher_batches").update(row).eq("id", batchId);
  return error ? { error: error.message } : {};
}

export async function deleteVoucherBatch(batchId: string): Promise<string | undefined> {
  if (!supabase) return ADMIN_MSG_CATALOG_UNAVAILABLE;
  const { error } = await supabase.from("voucher_batches").delete().eq("id", batchId);
  return error?.message;
}

function overridesToRow(o: InstanceOverridePayload): Record<string, unknown> {
  const pids =
    o.override_product_scope === "specific"
      ? (o.override_product_ids ?? [])
      : o.override_product_scope === "all"
        ? []
        : null;
  return {
    override_discount_type: o.override_discount_type,
    override_voucher_amount: o.override_voucher_amount,
    override_min_order_amount: o.override_min_order_amount,
    override_valid_from: o.override_valid_from,
    override_valid_until: o.override_valid_until,
    override_product_scope: o.override_product_scope,
    override_product_ids: pids,
  };
}

const CLEAR_INSTANCE_OVERRIDES: Record<string, unknown> = {
  override_discount_type: null,
  override_voucher_amount: null,
  override_min_order_amount: null,
  override_valid_from: null,
  override_valid_until: null,
  override_product_scope: null,
  override_product_ids: null,
  voucher_label: null,
};

/**
 * @param overrides - When assigning, pass merged rules (use emptyInstanceOverrides() to inherit defaults).
 * @param voucherLabel - Optional admin-only name for this assignment (e.g. "Birthday — Jane"); null clears.
 */
export async function assignVoucherInstance(
  instanceId: string,
  publicUserId: string | null,
  overrides?: InstanceOverridePayload | null,
  voucherLabel?: string | null,
): Promise<{ error?: string }> {
  if (!supabase) {
    return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const { data: inst, error: fetchErr } = await supabase
    .from("voucher_instances")
    .select("id, redeemed_at")
    .eq("id", instanceId)
    .maybeSingle();
  if (fetchErr || !inst) {
    return { error: fetchErr?.message ?? "Instance not found." };
  }
  if ((inst as { redeemed_at: string | null }).redeemed_at) {
    return { error: "Cannot change assignment on a code that is already used." };
  }

  const patch: Record<string, unknown> = { assigned_public_user_id: publicUserId };

  if (!publicUserId) {
    Object.assign(patch, CLEAR_INSTANCE_OVERRIDES);
  } else if (overrides !== undefined) {
    Object.assign(patch, overridesToRow(overrides ?? emptyInstanceOverrides()));
    if (voucherLabel !== undefined) {
      const t = typeof voucherLabel === "string" ? voucherLabel.trim() : "";
      patch.voucher_label = t || null;
    }
  }

  const { error } = await supabase.from("voucher_instances").update(patch).eq("id", instanceId);
  return error ? { error: error.message } : {};
}
