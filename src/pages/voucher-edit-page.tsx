import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { PageHeader } from "@/components/dashboard/page-header";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { DatetimePicker } from "@/components/ui/datetime-picker";
import { ProductMultiSelect } from "@/components/dashboard/product-multi-select";
import {
  assignVoucherInstance,
  createSharedVoucherBatch,
  createSingleCustomerVoucherBatch,
  createVoucherBatchWithQuantity,
  deleteVoucherBatch,
  emptyInstanceOverrides,
  fetchProductsForVoucherPicker,
  fetchPublicUsersForAssign,
  fetchVoucherBatchStatsById,
  fetchVoucherInstances,
  updateVoucherBatch,
  type InstanceOverridePayload,
  type ProductOption,
  type PublicUserOption,
  type VoucherBatchStatsRow,
  type VoucherBatchWritePayload,
  type VoucherInstanceRow,
} from "@/lib/supabase/vouchers";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import { inferVoucherTier, voucherTierBadgeClass, voucherTierLabel } from "@/lib/voucher-admin-labels";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultValidUntil(): string {
  const d = new Date();
  d.setDate(d.getDate() + 30);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultValidFrom(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function userLabel(u: PublicUserOption) {
  const n = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return n || `User ${u.id.slice(0, 8)}…`;
}

/** Readable summary of section-2 batch rules (what “campaign default” means for per-code overrides). */
function batchDefaultsSummary(args: {
  deferBatchRules: boolean;
  discountType: "fixed" | "percentage";
  voucherAmount: string;
  minOrderAmount: string;
  validFrom: string;
  validUntil: string;
  productScope: "all" | "specific";
  selectedProductIds: Set<string>;
  products: ProductOption[];
}): { title: string; lines: string[] } {
  if (args.deferBatchRules) {
    return {
      title: "No batch-wide discount or dates",
      lines: [
        "“Defer discount & dates” is on in section 2, so there are no campaign defaults for amount or validity.",
        "Use Modify on each code in section 3, or turn off deferral in section 2 and save campaign defaults.",
      ],
    };
  }
  const amt = Number.parseFloat(args.voucherAmount);
  const amtOk = !Number.isNaN(amt) && amt > 0;
  const disc =
    args.discountType === "percentage"
      ? amtOk
        ? `${amt}% off`
        : "—"
      : amtOk
        ? `PKR ${amt} off`
        : "—";
  let vf = "—";
  let vu = "—";
  try {
    if (args.validFrom) vf = new Date(args.validFrom).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    /* ignore */
  }
  try {
    if (args.validUntil) vu = new Date(args.validUntil).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    /* ignore */
  }
  const min = args.minOrderAmount.trim() || "0";
  let scope: string;
  if (args.productScope === "all") {
    scope = "Products: all";
  } else {
    const names = [...args.selectedProductIds]
      .map((id) => args.products.find((p) => p.id === id)?.name)
      .filter(Boolean) as string[];
    scope =
      names.length === 0
        ? "Products: specific (none selected — choose products in section 2)"
        : `Products: ${names.slice(0, 4).join(", ")}${names.length > 4 ? ` +${names.length - 4} more` : ""}`;
  }
  return {
    title: "Campaign defaults (from section 2)",
    lines: [`${disc} · Min. order PKR ${min}`, `Valid ${vf} → ${vu}`, scope],
  };
}

/** When batch defers rules, assigning to a customer requires per-code discount + validity. */
function assignmentMissingRequiredTerms(
  deferBatchRules: boolean,
  publicUserId: string | null,
  merged: InstanceOverridePayload,
): string | null {
  if (!deferBatchRules || !publicUserId) return null;
  if (!merged.override_discount_type) {
    return "Choose a discount type in the editor — this batch has no campaign-wide discount.";
  }
  if (merged.override_voucher_amount == null || merged.override_voucher_amount <= 0) {
    return "Enter a discount amount in the editor before assigning.";
  }
  if (!merged.override_valid_from || !merged.override_valid_until) {
    return "Enter valid from and until in the editor before assigning.";
  }
  const vf = new Date(merged.override_valid_from);
  const vu = new Date(merged.override_valid_until);
  if (Number.isNaN(vf.getTime()) || Number.isNaN(vu.getTime())) {
    return "Fix the valid dates in the editor.";
  }
  if (vu <= vf) {
    return "Valid until must be after valid from.";
  }
  if (merged.override_discount_type === "percentage" && merged.override_voucher_amount > 100) {
    return "Percentage must be 100 or less.";
  }
  return null;
}

function rowOverridesForSave(
  instanceId: string,
  draft: InstanceOverridePayload | undefined,
  productSets: Record<string, Set<string>>,
): InstanceOverridePayload {
  const base = draft ?? emptyInstanceOverrides();
  const scope = base.override_product_scope;
  let pids: string[] | null = base.override_product_ids;
  if (scope === "specific") {
    const set = productSets[instanceId];
    pids = set && set.size > 0 ? [...set] : [];
  } else if (scope === "all") {
    pids = [];
  }
  return { ...base, override_product_ids: pids };
}

export function VoucherEditPage() {
  const { voucherId } = useParams<{ voucherId: string }>();
  const navigate = useNavigate();
  const isNew = voucherId === "new" || !voucherId;

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  /** t1 = shared promo; t2 = unique batch; t3 = customer-specific */
  const [voucherType, setVoucherType] = useState<"t1" | "t2" | "t3">("t2");
  const [type3AssigneeId, setType3AssigneeId] = useState("");
  const [sharedCodeInput, setSharedCodeInput] = useState("WELCOME10");
  const [batchName, setBatchName] = useState("New campaign");
  const [quantity, setQuantity] = useState("100");
  const [discountType, setDiscountType] = useState<"fixed" | "percentage">("percentage");
  const [voucherAmount, setVoucherAmount] = useState("10");
  const [productScope, setProductScope] = useState<"all" | "specific">("all");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [minOrderAmount, setMinOrderAmount] = useState("0");
  const [validFrom, setValidFrom] = useState(defaultValidFrom);
  const [validUntil, setValidUntil] = useState(defaultValidUntil);

  const [stats, setStats] = useState<VoucherBatchStatsRow | null>(null);
  const [instances, setInstances] = useState<VoucherInstanceRow[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [publicUsers, setPublicUsers] = useState<PublicUserOption[]>([]);
  /** Per-instance draft user id for assign dropdown */
  const [assignDraft, setAssignDraft] = useState<Record<string, string>>({});
  /** Optional admin-only name when this code is assigned (e.g. "Birthday — Jane"). */
  const [labelDraft, setLabelDraft] = useState<Record<string, string>>({});
  /** Custom rules per code (batch defaults when all null). */
  const [overrideDraft, setOverrideDraft] = useState<Record<string, InstanceOverridePayload>>({});
  const [overrideProducts, setOverrideProducts] = useState<Record<string, Set<string>>>({});
  /** Single-code editor modal (unique batch table rows are read-only). */
  const [editCodeInstanceId, setEditCodeInstanceId] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  /** Multi batch: skip campaign-wide discount/dates (set per code when assigning). */
  const [deferBatchRules, setDeferBatchRules] = useState(false);
  /** Multi create: optional prefix + random segment length for generated codes. */
  const [codePrefix, setCodePrefix] = useState("");
  const [codeRandomLength, setCodeRandomLength] = useState("12");
  /** Edit: campaign metadata */
  const [batchStatus, setBatchStatus] = useState<"draft" | "active" | "paused" | "archived">("active");
  const [campaignPurpose, setCampaignPurpose] = useState("");
  const [attributionSource, setAttributionSource] = useState("");
  const [maxDiscountPkr, setMaxDiscountPkr] = useState("");

  useEffect(() => {
    if (!supabase || isNew || !voucherId) {
      queueMicrotask(() => setLoading(false));
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [s, inst, prods, users] = await Promise.all([
        fetchVoucherBatchStatsById(voucherId),
        fetchVoucherInstances(voucherId),
        fetchProductsForVoucherPicker(),
        fetchPublicUsersForAssign(),
      ]);
      if (cancelled) return;
      if (!s) {
        toast.error("Batch not found.");
        setLoading(false);
        return;
      }
      setStats(s);
      setInstances(inst);
      setProducts(prods);
      setPublicUsers(users);
      setBatchName(s.name);
      const multiDeferred = s.batch_kind === "multi" && s.discount_type == null;
      setDeferBatchRules(multiDeferred);
      setDiscountType(s.discount_type ?? "percentage");
      setVoucherAmount(s.voucher_amount != null ? String(s.voucher_amount) : "");
      setProductScope(s.product_scope);
      setSelectedProductIds(new Set(s.product_ids ?? []));
      setMinOrderAmount(String(s.min_order_amount));
      setValidFrom(s.valid_from ? toDatetimeLocalValue(s.valid_from) : "");
      setValidUntil(s.valid_until ? toDatetimeLocalValue(s.valid_until) : "");
      setBatchStatus(s.status ?? "active");
      setCampaignPurpose(s.campaign_purpose?.trim() ?? "");
      setAttributionSource(s.attribution_source?.trim() ?? "");
      setMaxDiscountPkr(
        s.max_discount_cents != null && s.max_discount_cents > 0
          ? String(s.max_discount_cents / 100)
          : "",
      );
      const drafts: Record<string, string> = {};
      const labels: Record<string, string> = {};
      const nextOverrides: Record<string, InstanceOverridePayload> = {};
      const nextOvProds: Record<string, Set<string>> = {};
      for (const i of inst) {
        drafts[i.id] = i.assigned_public_user_id ?? "";
        labels[i.id] = i.voucher_label ?? "";
        nextOverrides[i.id] = {
          override_discount_type: (i.override_discount_type as "fixed" | "percentage" | null) ?? null,
          override_voucher_amount: i.override_voucher_amount,
          override_min_order_amount: i.override_min_order_amount,
          override_valid_from: i.override_valid_from,
          override_valid_until: i.override_valid_until,
          override_product_scope: (i.override_product_scope as "all" | "specific" | null) ?? null,
          override_product_ids: i.override_product_ids,
        };
        if (i.override_product_ids?.length) {
          nextOvProds[i.id] = new Set(i.override_product_ids);
        }
      }
      setAssignDraft(drafts);
      setLabelDraft(labels);
      setOverrideDraft(nextOverrides);
      setOverrideProducts(nextOvProds);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew, voucherId]);

  useEffect(() => {
    if (!isNew || !supabase) return;
    let cancelled = false;
    void (async () => {
      const [prods, users] = await Promise.all([
        fetchProductsForVoucherPicker(),
        fetchPublicUsersForAssign(),
      ]);
      if (!cancelled) {
        setProducts(prods);
        setPublicUsers(users);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isNew]);

  useEffect(() => {
    if (isNew && voucherType === "t1") {
      queueMicrotask(() => setDeferBatchRules(false));
    }
    if (isNew && voucherType === "t3") {
      queueMicrotask(() => setDeferBatchRules(false));
    }
  }, [isNew, voucherType]);

  function mergeCampaignMeta(): Pick<
    VoucherBatchWritePayload,
    "status" | "campaign_purpose" | "attribution_source" | "max_discount_cents"
  > {
    const maxPkr = Number.parseFloat(maxDiscountPkr);
    const maxCents =
      Number.isFinite(maxPkr) && maxPkr > 0 ? Math.round(maxPkr * 100) : null;
    return {
      status: batchStatus,
      campaign_purpose: campaignPurpose.trim() || null,
      attribution_source: attributionSource.trim() || null,
      max_discount_cents: maxCents,
    };
  }

  function createCodeMeta(): Pick<VoucherBatchWritePayload, "code_prefix" | "code_random_length"> {
    const rl = Number.parseInt(codeRandomLength, 10);
    return {
      code_prefix: codePrefix.trim() || null,
      code_random_length: Number.isFinite(rl) ? Math.min(32, Math.max(4, rl)) : 12,
    };
  }

  function buildDeferredPayload(): VoucherBatchWritePayload {
    return {
      name: batchName.trim(),
      discount_type: null,
      voucher_amount: null,
      product_scope: "all",
      product_ids: [],
      min_order_amount: Number.parseFloat(minOrderAmount) || 0,
      valid_from: null,
      valid_until: null,
    };
  }

  function buildFullPayload(): VoucherBatchWritePayload {
    const vf = new Date(validFrom).toISOString();
    const vu = new Date(validUntil).toISOString();
    const amt = Number.parseFloat(voucherAmount);
    return {
      name: batchName.trim(),
      discount_type: discountType,
      voucher_amount: Number.isNaN(amt) ? null : amt,
      product_scope: productScope,
      product_ids: productScope === "specific" ? [...selectedProductIds] : [],
      min_order_amount: Number.parseFloat(minOrderAmount) || 0,
      valid_from: vf,
      valid_until: vu,
    };
  }

  async function onCreateSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      return;
    }
    setSaving(true);
    if (voucherType === "t1") {
      const vf = new Date(validFrom).toISOString();
      const vu = new Date(validUntil).toISOString();
      if (new Date(vu) <= new Date(vf)) {
        setSaving(false);
        toast.error("Valid until must be after valid from.");
        return;
      }
      const payload = buildFullPayload();
      if (payload.voucher_amount == null || payload.voucher_amount <= 0) {
        setSaving(false);
        toast.error("Enter a valid discount amount.");
        return;
      }
      const result = await createSharedVoucherBatch({ ...payload, ...mergeCampaignMeta() }, sharedCodeInput);
      setSaving(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Created shared promo code campaign.");
      navigate(`/dashboard/vouchers/${result.batchId}`, { replace: true });
      return;
    }

    if (voucherType === "t3") {
      const vf = new Date(validFrom).toISOString();
      const vu = new Date(validUntil).toISOString();
      if (new Date(vu) <= new Date(vf)) {
        setSaving(false);
        toast.error("Valid until must be after valid from.");
        return;
      }
      const payload = buildFullPayload();
      if (payload.voucher_amount == null || payload.voucher_amount <= 0) {
        setSaving(false);
        toast.error("Enter a valid discount amount.");
        return;
      }
      if (!type3AssigneeId.trim()) {
        setSaving(false);
        toast.error("Choose which customer receives this code.");
        return;
      }
      const result = await createSingleCustomerVoucherBatch(
        { ...payload, ...createCodeMeta(), ...mergeCampaignMeta() },
        type3AssigneeId.trim(),
      );
      setSaving(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success("Created customer-specific code.");
      navigate(`/dashboard/vouchers/${result.batchId}`, { replace: true });
      return;
    }

    const qty = Number.parseInt(quantity, 10);
    if (Number.isNaN(qty) || qty < 1) {
      setSaving(false);
      toast.error("Enter how many voucher codes to generate (1–10,000).");
      return;
    }
    if (deferBatchRules) {
      const result = await createVoucherBatchWithQuantity(
        { ...buildDeferredPayload(), ...createCodeMeta(), ...mergeCampaignMeta() },
        qty,
      );
      setSaving(false);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(`Created unique code batch — ${qty} codes (set rules per assignment if needed).`);
      navigate(`/dashboard/vouchers/${result.batchId}`, { replace: true });
      return;
    }

    const vf = new Date(validFrom).toISOString();
    const vu = new Date(validUntil).toISOString();
    if (new Date(vu) <= new Date(vf)) {
      setSaving(false);
      toast.error("Valid until must be after valid from.");
      return;
    }
    const payload = buildFullPayload();
    if (payload.voucher_amount == null || payload.voucher_amount <= 0) {
      setSaving(false);
      toast.error("Enter a valid discount amount.");
      return;
    }
    const result = await createVoucherBatchWithQuantity(
      { ...payload, ...createCodeMeta(), ...mergeCampaignMeta() },
      qty,
    );
    setSaving(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success(`Created unique code batch — ${qty} unique codes.`);
    navigate(`/dashboard/vouchers/${result.batchId}`, { replace: true });
  }

  async function onUpdateBatch(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !voucherId || isNew) return;

    let payload: VoucherBatchWritePayload;
    if (stats?.batch_kind === "shared") {
      const vf = new Date(validFrom).toISOString();
      const vu = new Date(validUntil).toISOString();
      if (new Date(vu) <= new Date(vf)) {
        toast.error("Valid until must be after valid from.");
        return;
      }
      payload = { ...buildFullPayload(), ...mergeCampaignMeta() };
      if (payload.voucher_amount == null || payload.voucher_amount <= 0) {
        toast.error("Enter a valid discount amount.");
        return;
      }
    } else if (deferBatchRules) {
      payload = { ...buildDeferredPayload(), ...mergeCampaignMeta() };
    } else {
      const vf = new Date(validFrom).toISOString();
      const vu = new Date(validUntil).toISOString();
      if (new Date(vu) <= new Date(vf)) {
        toast.error("Valid until must be after valid from.");
        return;
      }
      payload = { ...buildFullPayload(), ...mergeCampaignMeta() };
      if (payload.voucher_amount == null || payload.voucher_amount <= 0) {
        toast.error("Enter a valid discount amount.");
        return;
      }
    }

    setSaving(true);
    const { error: uErr } = await updateVoucherBatch(voucherId, payload);
    setSaving(false);
    if (uErr) {
      toast.error(uErr);
      return;
    }
    toast.success("Campaign saved.");
    const s = await fetchVoucherBatchStatsById(voucherId);
    if (s) {
      setStats(s);
      if (s.batch_kind === "multi") {
        setDeferBatchRules(s.discount_type == null);
      }
    }
  }

  async function onAssign(instanceId: string) {
    setAssignBusy(true);
    try {
      const uid = assignDraft[instanceId]?.trim() || null;
      const ov = overrideDraft[instanceId];
      const merged = rowOverridesForSave(instanceId, ov, overrideProducts);
      const assignErr = assignmentMissingRequiredTerms(deferBatchRules, uid, merged);
      if (assignErr) {
        toast.error(assignErr);
        setEditCodeInstanceId(instanceId);
        return;
      }
      const lbl = (labelDraft[instanceId] ?? "").trim() || null;
      const { error: aErr } = uid
        ? await assignVoucherInstance(instanceId, uid, merged, lbl)
        : await assignVoucherInstance(instanceId, null);
      if (aErr) {
        toast.error(aErr);
        return;
      }
      toast.success(
        uid ? "Applied — reservation and voucher rules saved." : "Cleared — code is back in the open pool.",
      );
      setEditCodeInstanceId(null);
      if (voucherId) {
        const inst = await fetchVoucherInstances(voucherId);
        setInstances(inst);
        const drafts: Record<string, string> = { ...assignDraft };
        const nextLabels: Record<string, string> = { ...labelDraft };
        const nextOverrides = { ...overrideDraft };
        const nextProds = { ...overrideProducts };
        for (const i of inst) {
          drafts[i.id] = i.assigned_public_user_id ?? "";
          nextLabels[i.id] = i.voucher_label ?? "";
          nextOverrides[i.id] = {
            override_discount_type: (i.override_discount_type as "fixed" | "percentage" | null) ?? null,
            override_voucher_amount: i.override_voucher_amount,
            override_min_order_amount: i.override_min_order_amount,
            override_valid_from: i.override_valid_from,
            override_valid_until: i.override_valid_until,
            override_product_scope: (i.override_product_scope as "all" | "specific" | null) ?? null,
            override_product_ids: i.override_product_ids,
          };
          if (i.override_product_ids?.length) {
            nextProds[i.id] = new Set(i.override_product_ids);
          } else {
            delete nextProds[i.id];
          }
        }
        setAssignDraft(drafts);
        setLabelDraft(nextLabels);
        setOverrideDraft(nextOverrides);
        setOverrideProducts(nextProds);
        const s = await fetchVoucherBatchStatsById(voucherId);
        if (s) setStats(s);
      }
    } finally {
      setAssignBusy(false);
    }
  }

  async function onDelete() {
    if (isNew || !voucherId || !supabase) return;
    if (!window.confirm("Delete this entire batch and all its codes?")) return;
    const err = await deleteVoucherBatch(voucherId);
    if (err) {
      toast.error(err);
      return;
    }
    navigate("/dashboard/vouchers");
  }

  function patchOverride(instanceId: string, partial: Partial<InstanceOverridePayload>) {
    setOverrideDraft((d) => ({
      ...d,
      [instanceId]: { ...(d[instanceId] ?? emptyInstanceOverrides()), ...partial },
    }));
  }

  function beginEditInstance(row: VoucherInstanceRow) {
    if (row.redeemed_at) return;
    setAssignDraft((d) => ({ ...d, [row.id]: row.assigned_public_user_id ?? "" }));
    setLabelDraft((d) => ({ ...d, [row.id]: row.voucher_label ?? "" }));
    setOverrideDraft((d) => ({
      ...d,
      [row.id]: {
        override_discount_type: (row.override_discount_type as "fixed" | "percentage" | null) ?? null,
        override_voucher_amount: row.override_voucher_amount,
        override_min_order_amount: row.override_min_order_amount,
        override_valid_from: row.override_valid_from,
        override_valid_until: row.override_valid_until,
        override_product_scope: (row.override_product_scope as "all" | "specific" | null) ?? null,
        override_product_ids: row.override_product_ids,
      },
    }));
    setOverrideProducts((p) => {
      const n = { ...p };
      if (row.override_product_ids?.length) {
        n[row.id] = new Set(row.override_product_ids);
      } else {
        delete n[row.id];
      }
      return n;
    });
    setEditCodeInstanceId(row.id);
  }

  const editRow = editCodeInstanceId
    ? instances.find((i) => i.id === editCodeInstanceId)
    : undefined;

  if (!supabase) {
    return (
      <p className="text-sm text-muted-foreground">{ADMIN_MSG_CATALOG_UNAVAILABLE}</p>
    );
  }

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }

  const batchKind = stats?.batch_kind ?? "multi";
  const isShared = batchKind === "shared";
  const tierForHeader = stats
    ? (() => {
        const tier = inferVoucherTier(stats);
        return { tier, label: voucherTierLabel(tier) };
      })()
    : null;

  const campaignDefaultsSummary = batchDefaultsSummary({
    deferBatchRules,
    discountType,
    voucherAmount,
    minOrderAmount,
    validFrom,
    validUntil,
    productScope,
    selectedProductIds,
    products,
  });

  if (isNew) {
    return (
      <div className="w-full space-y-8">
        <PageHeader
          backLink={{ to: "/dashboard/vouchers", label: "Vouchers" }}
          title="Create voucher"
          wideDescription
          description="Pick a format: one shared promo code, a batch of unique codes (pool), or a single code reserved for one customer."
        />
        <form onSubmit={(e) => void onCreateSubmit(e)} className="w-full space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                {
                  id: "t1" as const,
                  title: "Shared promo code",
                  subtitle: "One code at checkout",
                  hint: "Everyone uses the same code; each customer redeems once",
                },
                {
                  id: "t2" as const,
                  title: "Unique code batch",
                  subtitle: "Pool of codes",
                  hint: "Generate many codes; assign from the pool or set rules per code",
                },
                {
                  id: "t3" as const,
                  title: "Customer-specific code",
                  subtitle: "One shopper only",
                  hint: "We create one code and assign it to the customer you choose",
                },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setVoucherType(opt.id)}
                className={cn(
                  "rounded-xl border-2 p-4 text-left transition",
                  voucherType === opt.id
                    ? "border-primary bg-primary/5 ring-2 ring-primary/20"
                    : "border-border bg-card hover:border-muted-foreground/30",
                )}
              >
                <p className="text-sm font-semibold text-foreground">{opt.title}</p>
                <p className="mt-0.5 text-xs font-medium text-muted-foreground">{opt.subtitle}</p>
                <p className="mt-2 text-xs leading-snug text-muted-foreground">{opt.hint}</p>
              </button>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Campaign details</CardTitle>
              <CardDescription>
                {voucherType === "t1" && "Set the single promo code customers will type at checkout."}
                {voucherType === "t2" && "How many codes to generate and optional prefix for this batch."}
                {voucherType === "t3" && "We generate one code and reserve it for the customer you pick."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="vb-name">Campaign name (internal)</Label>
                  <Input
                    id="vb-name"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    required
                    placeholder="e.g. Spring launch"
                  />
                  <p className="text-xs text-muted-foreground">
                    Shown only in admin lists and exports. Customers see the voucher code, not this title.
                  </p>
                </div>
                {voucherType === "t1" ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="vb-shared">Public promo code</Label>
                    <Input
                      id="vb-shared"
                      value={sharedCodeInput}
                      onChange={(e) => setSharedCodeInput(e.target.value.toUpperCase())}
                      required
                      placeholder="WELCOME10"
                      className="font-mono uppercase"
                      maxLength={32}
                    />
                    <p className="text-xs text-muted-foreground">Alphanumeric only; stored uppercase.</p>
                  </div>
                ) : null}

                {voucherType === "t2" ? (
                  <div className="space-y-2">
                    <Label htmlFor="vb-qty">Number of codes</Label>
                    <Input
                      id="vb-qty"
                      value={quantity}
                      onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
                      required
                      inputMode="numeric"
                      placeholder="100"
                    />
                    <p className="text-xs text-muted-foreground">1–10,000 unique codes.</p>
                  </div>
                ) : null}

                {voucherType === "t2" || voucherType === "t3" ? (
                  <div className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="vb-prefix">Code prefix (optional)</Label>
                      <Input
                        id="vb-prefix"
                        value={codePrefix}
                        onChange={(e) => setCodePrefix(e.target.value.toUpperCase())}
                        placeholder="SUMMER"
                        className="font-mono uppercase"
                        maxLength={16}
                      />
                      <p className="text-xs text-muted-foreground">Prepended to the random segment.</p>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="vb-randlen">Random segment length</Label>
                      <Input
                        id="vb-randlen"
                        value={codeRandomLength}
                        onChange={(e) => setCodeRandomLength(e.target.value.replace(/\D/g, "").slice(0, 2))}
                        inputMode="numeric"
                        placeholder="12"
                      />
                      <p className="text-xs text-muted-foreground">4–32 characters ({voucherType === "t3" ? "one code" : "each code"}).</p>
                    </div>
                  </div>
                ) : null}

                {voucherType === "t3" ? (
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="vb-t3-user">Customer who receives the code</Label>
                    <select
                      id="vb-t3-user"
                      value={type3AssigneeId}
                      onChange={(e) => setType3AssigneeId(e.target.value)}
                      required
                      className={cn(
                        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm",
                        !type3AssigneeId && "text-muted-foreground",
                      )}
                    >
                      <option value="">Select a customer…</option>
                      {publicUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {userLabel(u)}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-muted-foreground">
                      The code is tied to this account at checkout (same as assigning after creation).
                    </p>
                  </div>
                ) : null}

                {voucherType === "t2" ? (
                  <div className="space-y-2 sm:col-span-2">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={deferBatchRules}
                        onCheckedChange={(c) => setDeferBatchRules(c === true)}
                      />
                      Defer campaign rules — set discount & dates per code when assigning
                    </label>
                    <p className="text-xs text-muted-foreground">
                      Use this for bulk pools; you can add batch defaults later by editing the campaign.
                    </p>
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {voucherType === "t2" && deferBatchRules ? (
            <Card>
              <CardHeader>
                <CardTitle>Campaign rules</CardTitle>
                <CardDescription>
                  No batch-wide discount or dates. After creation, click <strong>Modify</strong> on each code in section 3
                  when you assign it to a customer (or add defaults here later via Edit).
                </CardDescription>
              </CardHeader>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <CardTitle>Discount rules</CardTitle>
                <CardDescription>
                  {voucherType === "t1"
                    ? "These rules apply to every redemption of the shared code."
                    : voucherType === "t3"
                      ? "This campaign applies to the single issued code."
                      : "Default rules for every generated code. Override per assignment when needed."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="vb-type">Discount type</Label>
                    <select
                      id="vb-type"
                      value={discountType}
                      onChange={(e) => setDiscountType(e.target.value as "fixed" | "percentage")}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    >
                      <option value="percentage">Percentage</option>
                      <option value="fixed">Fixed amount (PKR)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vb-amt">
                      {discountType === "percentage" ? "Percent off" : "Amount off (PKR)"}
                    </Label>
                    <Input
                      id="vb-amt"
                      value={voucherAmount}
                      onChange={(e) => setVoucherAmount(e.target.value)}
                      required
                      inputMode="decimal"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Applies to</Label>
                  <RadioGroup
                    value={productScope}
                    onValueChange={(v) => setProductScope(v as "all" | "specific")}
                    className="flex flex-wrap gap-4"
                  >
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <RadioGroupItem value="all" id="vb-scope-all" />
                      All products
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <RadioGroupItem value="specific" id="vb-scope-specific" />
                      Specific products
                    </label>
                  </RadioGroup>
                </div>

                {productScope === "specific" ? (
                  <div className="space-y-2">
                    <Label htmlFor="vb-products">Products</Label>
                    {products.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No products in catalog.</p>
                    ) : (
                      <ProductMultiSelect
                        inputId="vb-products"
                        products={products}
                        value={selectedProductIds}
                        onChange={setSelectedProductIds}
                        aria-label="Products this voucher applies to"
                      />
                    )}
                    <p className="text-xs text-muted-foreground">Search and select products from your catalog.</p>
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="vb-min">Minimum order amount (PKR)</Label>
                  <Input
                    id="vb-min"
                    value={minOrderAmount}
                    onChange={(e) => setMinOrderAmount(e.target.value)}
                    inputMode="decimal"
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="vb-from">Valid from</Label>
                    <DatetimePicker
                      id="vb-from"
                      value={validFrom}
                      onChange={setValidFrom}
                      placeholder="Start date & time"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vb-until">Valid until</Label>
                    <DatetimePicker
                      id="vb-until"
                      value={validUntil}
                      onChange={setValidUntil}
                      placeholder="End date & time"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={saving}>
              {saving
                ? "Creating…"
                : voucherType === "t1"
                  ? "Create shared promo code"
                  : voucherType === "t3"
                    ? "Create customer-specific code"
                    : "Create unique code batch"}
            </Button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full space-y-8">
      <PageHeader
        backLink={{ to: "/dashboard/vouchers", label: "Vouchers" }}
        title={stats?.name ?? "Voucher batch"}
        wideDescription
        description={
          isShared
            ? "One public code — use the numbered sections below, then save once. Each customer can redeem once while active."
            : stats?.discount_type == null
              ? "Unique batch: campaign rules deferred; set terms per code when assigning, or add defaults below."
              : "Edit rules, codes, and assignments. Batches use unique codes; customer-specific campaigns are a single code issued to one shopper."
        }
      />

      {tierForHeader ? (
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn("font-normal", voucherTierBadgeClass(tierForHeader.tier))}
          >
            {tierForHeader.label.title}
          </Badge>
          <span className="text-sm text-muted-foreground">{tierForHeader.label.description}</span>
        </div>
      ) : null}

      {stats ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>{isShared ? "Type" : "Total codes"}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {isShared ? "Shared" : stats.total_codes}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Available</CardDescription>
              <CardTitle className="text-2xl tabular-nums text-emerald-600 dark:text-emerald-400">
                {stats.available_count == null ? "—" : stats.available_count}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Used (redemptions)</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{stats.used_count}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>In pool (unassigned)</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {stats.unassigned_available_count == null ? "—" : stats.unassigned_available_count}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Issued, not redeemed</CardDescription>
              <CardTitle className="text-2xl tabular-nums">
                {stats.assigned_not_redeemed_count == null ? "—" : stats.assigned_not_redeemed_count}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      ) : null}

      {stats ? (
        <form onSubmit={(e) => void onUpdateBatch(e)} className="w-full max-w-none space-y-6">
          {isShared ? (
            <>
              <Card className="border-primary/25 bg-primary/4 dark:bg-primary/6">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Manage this shared promo — 3 steps</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">
                    Read top to bottom: <strong>public code</strong> (what shoppers type) → <strong>ops</strong> (pause,
                    labels for your team) → <strong>the offer</strong> (discount &amp; dates). Use{" "}
                    <strong>one save</strong> at the end for all of it.
                  </CardDescription>
                </CardHeader>
              </Card>

              <Card className="overflow-hidden border-2 border-primary/25 shadow-sm">
                <CardHeader className="border-b bg-muted/40 pb-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                      aria-hidden
                    >
                      1
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <CardTitle className="text-lg">Public code at checkout</CardTitle>
                      <CardDescription>Shoppers enter this exact code — not your internal campaign name below.</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-5">
                  <p className="break-all font-mono text-2xl font-semibold tracking-wider text-foreground sm:text-3xl">
                    {stats.shared_code}
                  </p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    The string is fixed for this campaign. To use a different code, create a new shared promo.
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground"
                      aria-hidden
                    >
                      2
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <CardTitle className="text-lg">Ops &amp; internal labels</CardTitle>
                      <CardDescription>
                        Not shown to customers. <strong>Status</strong> turns redemption on/off on the store. Purpose and
                        attribution help you search and export; max cap limits discount size at checkout.
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="vb-status">Status</Label>
                    <select
                      id="vb-status"
                      value={batchStatus}
                      onChange={(e) => setBatchStatus(e.target.value as typeof batchStatus)}
                      className="flex h-10 w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm"
                    >
                      <option value="draft">Draft — not redeemable</option>
                      <option value="active">Active — can redeem</option>
                      <option value="paused">Paused — temporarily off</option>
                      <option value="archived">Archived — historical only</option>
                    </select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="vb-purpose">Internal: campaign purpose (optional)</Label>
                    <Input
                      id="vb-purpose"
                      value={campaignPurpose}
                      onChange={(e) => setCampaignPurpose(e.target.value)}
                      placeholder="e.g. Spring launch, retention"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="vb-attr">Internal: attribution (optional)</Label>
                    <Input
                      id="vb-attr"
                      value={attributionSource}
                      onChange={(e) => setAttributionSource(e.target.value)}
                      placeholder="e.g. newsletter, meta_ads"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="vb-maxdisc">Max discount cap (PKR, optional)</Label>
                    <Input
                      id="vb-maxdisc"
                      value={maxDiscountPkr}
                      onChange={(e) => setMaxDiscountPkr(e.target.value)}
                      inputMode="decimal"
                      placeholder="Leave empty for no cap"
                    />
                    <p className="text-xs text-muted-foreground">
                      Upper bound on the discount amount computed at checkout.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start gap-3">
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-foreground"
                      aria-hidden
                    >
                      3
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <CardTitle className="text-lg">The offer &amp; eligibility</CardTitle>
                      <CardDescription>
                        Internal title, discount, which products, minimum cart, and valid window. Applies to everyone who uses
                        the public code (once per customer, while active).
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="e-name">Campaign name (internal only)</Label>
                    <Input
                      id="e-name"
                      value={batchName}
                      onChange={(e) => setBatchName(e.target.value)}
                      required
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="e-type">Discount type</Label>
                      <select
                        id="e-type"
                        value={discountType}
                        onChange={(e) => setDiscountType(e.target.value as "fixed" | "percentage")}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                      >
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed amount (PKR)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="e-amt">
                        {discountType === "percentage" ? "Percent off" : "Amount off (PKR)"}
                      </Label>
                      <Input
                        id="e-amt"
                        value={voucherAmount}
                        onChange={(e) => setVoucherAmount(e.target.value)}
                        required
                        inputMode="decimal"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Applies to</Label>
                    <RadioGroup
                      value={productScope}
                      onValueChange={(v) => setProductScope(v as "all" | "specific")}
                      className="flex flex-wrap gap-4"
                    >
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <RadioGroupItem value="all" id="e-scope-all-shared" />
                        All products
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <RadioGroupItem value="specific" id="e-scope-specific-shared" />
                        Specific products
                      </label>
                    </RadioGroup>
                  </div>

                  {productScope === "specific" ? (
                    <div className="space-y-2">
                      <Label htmlFor="e-products">Products</Label>
                      <ProductMultiSelect
                        inputId="e-products"
                        products={products}
                        value={selectedProductIds}
                        onChange={setSelectedProductIds}
                        aria-label="Products this campaign applies to"
                      />
                    </div>
                  ) : null}

                  <div className="space-y-2">
                    <Label htmlFor="e-min">Minimum order amount (PKR)</Label>
                    <Input
                      id="e-min"
                      value={minOrderAmount}
                      onChange={(e) => setMinOrderAmount(e.target.value)}
                      inputMode="decimal"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="e-from">Valid from</Label>
                      <DatetimePicker
                        id="e-from"
                        value={validFrom}
                        onChange={setValidFrom}
                        placeholder="Start date & time"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="e-until">Valid until</Label>
                      <DatetimePicker
                        id="e-until"
                        value={validUntil}
                        onChange={setValidUntil}
                        placeholder="End date & time"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex flex-col gap-3 rounded-xl border border-dashed border-primary/30 bg-muted/20 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Saves <strong>ops</strong>, <strong>labels</strong>, and <strong>discount rules</strong> in one go.
                </p>
                <Button type="submit" disabled={saving} size="lg" className="shrink-0 sm:min-w-[220px]">
                  {saving ? "Saving…" : "Save shared promo"}
                </Button>
              </div>
            </>
          ) : (
            <>
              <Card className="w-full">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Unique code batch — this screen</CardTitle>
                  <CardDescription className="leading-relaxed">
                    <strong>Section 1</strong> — internal labels &amp; status. <strong>Section 2</strong> — default discount
                    rules for all codes (or defer and set per code). <strong>Codes</strong> below — assign customers and
                    optional custom terms per row.
                  </CardDescription>
                </CardHeader>
              </Card>

              <div className="grid w-full gap-6 xl:grid-cols-2 xl:items-start">
              <Card className="w-full min-w-0">
                <CardHeader>
                  <CardTitle className="text-lg">1 · Ops &amp; internal labels</CardTitle>
                  <CardDescription>Status controls redemption. Purpose / attribution for lists and exports.</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="vb-status-m">Status</Label>
                    <select
                      id="vb-status-m"
                      value={batchStatus}
                      onChange={(e) => setBatchStatus(e.target.value as typeof batchStatus)}
                      className="flex h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    >
                      <option value="draft">Draft</option>
                      <option value="active">Active</option>
                      <option value="paused">Paused</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="vb-purpose-m">Campaign purpose (optional)</Label>
                    <Input
                      id="vb-purpose-m"
                      value={campaignPurpose}
                      onChange={(e) => setCampaignPurpose(e.target.value)}
                      placeholder="e.g. Spring launch"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="vb-attr-m">Attribution source (optional)</Label>
                    <Input
                      id="vb-attr-m"
                      value={attributionSource}
                      onChange={(e) => setAttributionSource(e.target.value)}
                      placeholder="e.g. newsletter, influencer_id"
                    />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="vb-maxdisc-m">Max discount cap (PKR, optional)</Label>
                    <Input
                      id="vb-maxdisc-m"
                      value={maxDiscountPkr}
                      onChange={(e) => setMaxDiscountPkr(e.target.value)}
                      inputMode="decimal"
                      placeholder="Leave empty for no cap"
                    />
                    <p className="text-xs text-muted-foreground">
                      Caps the computed discount in checkout (same currency as catalog).
                    </p>
                  </div>
                  {stats.code_prefix ? (
                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      Code pattern (set at creation): prefix <span className="font-mono">{stats.code_prefix}</span>
                      {stats.code_random_length != null ? ` + ${stats.code_random_length} random chars` : null}.
                    </p>
                  ) : null}
                </CardContent>
              </Card>

              <Card className="w-full min-w-0">
                <CardHeader>
                  <CardTitle className="text-lg">2 · Campaign name &amp; default rules</CardTitle>
                  <CardDescription>
                    {deferBatchRules
                      ? "Discount and validity are not stored on the batch — you set them per code in section 3 (or turn off deferral to define one default for every code here)."
                      : "These rules apply to every code unless you override them via Modify on a specific code."}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="e-name">Campaign name (internal)</Label>
                    <Input
                      id="e-name"
                      value={batchName}
                      onChange={(e) => setBatchName(e.target.value)}
                      required
                    />
                    <p className="text-xs text-muted-foreground">
                      Shown in admin lists. Per-code labels are set in the Codes table.
                    </p>
                  </div>

                  <div className="rounded-md border border-dashed border-border p-3">
                    <label className="flex cursor-pointer items-center gap-2 text-sm">
                      <Checkbox
                        checked={deferBatchRules}
                        onCheckedChange={(c) => {
                          const next = c === true;
                          setDeferBatchRules(next);
                          if (!next) {
                            setValidFrom((p) => p || defaultValidFrom());
                            setValidUntil((p) => p || defaultValidUntil());
                            setVoucherAmount((p) => p || "10");
                          }
                        }}
                      />
                      Defer discount &amp; dates — set only per code (recommended for different offers per customer)
                    </label>
                    <p className="mt-2 text-xs text-muted-foreground">
                      When checked, section 2 only saves the campaign name and ops fields. Discount and dates must be filled
                      via <strong>Modify</strong> (section 3) before you assign a code to someone.
                    </p>
                  </div>

                  {!deferBatchRules ? (
                    <>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="e-type">Discount type</Label>
                          <select
                            id="e-type"
                            value={discountType}
                            onChange={(e) => setDiscountType(e.target.value as "fixed" | "percentage")}
                            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                          >
                            <option value="percentage">Percentage</option>
                            <option value="fixed">Fixed amount (PKR)</option>
                          </select>
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="e-amt">
                            {discountType === "percentage" ? "Percent off" : "Amount off (PKR)"}
                          </Label>
                          <Input
                            id="e-amt"
                            value={voucherAmount}
                            onChange={(e) => setVoucherAmount(e.target.value)}
                            required
                            inputMode="decimal"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Applies to</Label>
                        <RadioGroup
                          value={productScope}
                          onValueChange={(v) => setProductScope(v as "all" | "specific")}
                          className="flex flex-wrap gap-4"
                        >
                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <RadioGroupItem value="all" id="e-scope-all-multi" />
                            All products
                          </label>
                          <label className="flex cursor-pointer items-center gap-2 text-sm">
                            <RadioGroupItem value="specific" id="e-scope-specific-multi" />
                            Specific products
                          </label>
                        </RadioGroup>
                      </div>

                      {productScope === "specific" ? (
                        <div className="space-y-2">
                          <Label htmlFor="e-products">Products</Label>
                          <ProductMultiSelect
                            inputId="e-products"
                            products={products}
                            value={selectedProductIds}
                            onChange={setSelectedProductIds}
                            aria-label="Products this campaign applies to"
                          />
                        </div>
                      ) : null}

                      <div className="space-y-2">
                        <Label htmlFor="e-min">Minimum order amount (PKR)</Label>
                        <Input
                          id="e-min"
                          value={minOrderAmount}
                          onChange={(e) => setMinOrderAmount(e.target.value)}
                          inputMode="decimal"
                        />
                      </div>

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="e-from">Valid from</Label>
                          <DatetimePicker
                            id="e-from"
                            value={validFrom}
                            onChange={setValidFrom}
                            placeholder="Start date & time"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="e-until">Valid until</Label>
                          <DatetimePicker
                            id="e-until"
                            value={validUntil}
                            onChange={setValidUntil}
                            placeholder="End date & time"
                          />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div
                      role="note"
                      className="space-y-3 rounded-lg border border-amber-500/35 bg-amber-500/6 p-4 text-sm dark:bg-amber-500/8"
                    >
                      <p className="font-medium text-foreground">How to assign codes in this mode</p>
                      <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
                        <li>
                          In section 3, click <strong>Modify</strong> on a row, then pick a customer (or leave{" "}
                          <strong>Open pool</strong> so anyone can use the code).
                        </li>
                        <li>
                          Click <strong>Modify</strong> on a row, then set discount type, amount, and valid dates in the
                          dialog (required before reserving for a customer).
                        </li>
                        <li>
                          Click <strong>Apply changes</strong> in the dialog to save assignment and rules together.
                        </li>
                      </ol>
                      <p className="text-xs text-muted-foreground">
                        Want one discount for the whole batch instead? Uncheck deferral above — section 2 will show amount,
                        products, and dates for all codes.
                      </p>
                    </div>
                  )}

                  <Button type="submit" disabled={saving} className="w-full sm:w-auto">
                    {saving ? "Saving…" : deferBatchRules ? "Save name & ops (not discount rules)" : "Save campaign defaults & ops"}
                  </Button>
                </CardContent>
              </Card>
              </div>
            </>
          )}
        </form>
      ) : null}

      {!isShared ? (
        <>
          <Card className="w-full max-w-none">
            <CardHeader>
              <CardTitle className="text-lg">3 · Codes in this batch</CardTitle>
              <CardDescription className="leading-relaxed">
                <span className="block">
                  The table is read-only. Click <strong>Modify</strong> on a row to reserve the code, set an optional
                  internal name, and edit per-code discount rules — then apply from the dialog.{" "}
                  <strong>Redemption</strong> = used at checkout; <strong>reservation</strong> = who the code is held
                  for.
                </span>
                {deferBatchRules ? (
                  <span className="mt-2 block text-amber-900/90 dark:text-amber-100/90">
                    This batch uses <strong>deferred rules</strong>: set discount and dates in the editor before assigning
                    a code to a customer.
                  </span>
                ) : null}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {instances.length === 0 ? (
                <p className="text-sm text-muted-foreground">No instances.</p>
              ) : (
                <ScrollArea className="h-[min(32rem,70vh)] w-full rounded-md border">
                  <table className="w-full min-w-[720px] text-left text-sm">
                    <thead className="sticky top-0 bg-muted/80 backdrop-blur">
                      <tr className="border-b text-xs uppercase text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Code</th>
                        <th className="px-3 py-2 font-medium">Voucher name</th>
                        <th className="px-3 py-2 font-medium">Redemption</th>
                        <th className="px-3 py-2 font-medium">Reservation</th>
                        <th className="w-[120px] px-3 py-2 font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {instances.map((row) => {
                        const used = Boolean(row.redeemed_at);
                        return (
                          <tr key={row.id} className="border-b border-border/50">
                            <td className="px-3 py-2.5 font-mono text-xs">{row.code}</td>
                            <td className="px-3 py-2.5 text-xs text-muted-foreground">
                              {row.voucher_label?.trim() ? row.voucher_label : "—"}
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              {used ? (
                                <div className="space-y-0.5">
                                  <Badge variant="secondary">Used</Badge>
                                  {row.redeemed_at ? (
                                    <span className="block text-[10px] text-muted-foreground">
                                      {new Date(row.redeemed_at).toLocaleString()}
                                    </span>
                                  ) : null}
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <Badge
                                    variant="outline"
                                    className="border-sky-600/40 text-sky-900 dark:text-sky-100"
                                  >
                                    Not redeemed
                                  </Badge>
                                  <span className="block text-[10px] leading-tight text-muted-foreground">
                                    Still valid until used at checkout
                                  </span>
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5 align-top text-xs text-muted-foreground">
                              {used
                                ? row.assigned_public_user_id
                                  ? userLabel(
                                      publicUsers.find((u) => u.id === row.assigned_public_user_id) ?? {
                                        id: row.assigned_public_user_id,
                                        first_name: "",
                                        last_name: "",
                                        phone: "",
                                      },
                                    )
                                  : "—"
                                : null}
                              {!used && row.assigned_public_user_id ? (
                                <div className="space-y-1">
                                  <Badge variant="secondary" className="text-[10px] font-normal">
                                    Reserved
                                  </Badge>
                                  <div>
                                    {userLabel(
                                      publicUsers.find((u) => u.id === row.assigned_public_user_id) ?? {
                                        id: row.assigned_public_user_id,
                                        first_name: "",
                                        last_name: "",
                                        phone: "",
                                      },
                                    )}
                                  </div>
                                </div>
                              ) : null}
                              {!used && !row.assigned_public_user_id ? (
                                <div className="space-y-1">
                                  <Badge variant="outline" className="text-[10px] font-normal">
                                    Open pool
                                  </Badge>
                                  <p className="italic text-muted-foreground">Any customer can claim</p>
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5">
                              {used ? (
                                <span className="text-xs text-muted-foreground">—</span>
                              ) : (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="text-xs"
                                  onClick={() => beginEditInstance(row)}
                                >
                                  Modify
                                </Button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </ScrollArea>
              )}
            </CardContent>
          </Card>

          <Dialog
            open={editCodeInstanceId !== null && Boolean(editRow && !editRow.redeemed_at)}
            onOpenChange={(open) => {
              if (!open) setEditCodeInstanceId(null);
            }}
          >
            {editRow && !editRow.redeemed_at ? (
              <DialogContent className="flex max-h-[min(92vh,56rem)] max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
                <div className="space-y-4 p-6 pb-4">
                  <DialogHeader>
                    <DialogTitle className="font-mono text-base tracking-tight">
                      Modify code — {editRow.code}
                    </DialogTitle>
                    <DialogDescription>
                      Reserve for a customer (or leave in the open pool), optional internal name, and per-code discount
                      rules. <strong>Apply changes</strong> saves and closes this dialog.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-2">
                    <Label htmlFor="modal-assign">Reserve for customer</Label>
                    <select
                      id="modal-assign"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                      value={assignDraft[editRow.id] ?? ""}
                      onChange={(e) =>
                        setAssignDraft((d) => ({ ...d, [editRow.id]: e.target.value }))
                      }
                    >
                      <option value="">Open pool — any customer can use</option>
                      {publicUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {userLabel(u)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="modal-vlabel">Voucher name (optional, internal)</Label>
                    <Input
                      id="modal-vlabel"
                      placeholder="e.g. Birthday offer"
                      value={labelDraft[editRow.id] ?? ""}
                      onChange={(e) => setLabelDraft((d) => ({ ...d, [editRow.id]: e.target.value }))}
                    />
                  </div>
                </div>

                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto border-y bg-muted/15 px-6 py-4">
                  <div className="rounded-lg border border-border bg-background/90 p-3 shadow-sm">
                    <p className="text-xs font-semibold text-foreground">{campaignDefaultsSummary.title}</p>
                    <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted-foreground">
                      {campaignDefaultsSummary.lines.map((line, i) => (
                        <li key={i}>{line}</li>
                      ))}
                    </ul>
                  </div>
                  {deferBatchRules ? (
                    <p className="text-xs text-muted-foreground">
                      This batch has <strong>no</strong> campaign-wide discount or dates. Fill the fields below before
                      assigning to a customer. Empty discount fields are only OK for codes left in the{" "}
                      <strong>open pool</strong>.
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      Empty fields use the batch rules in section 2. Filled fields apply when this code is{" "}
                      <strong>reserved</strong> for a customer (not required for open-pool codes).
                    </p>
                  )}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Discount type</Label>
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        value={(overrideDraft[editRow.id] ?? emptyInstanceOverrides()).override_discount_type ?? ""}
                        onChange={(e) =>
                          patchOverride(editRow.id, {
                            override_discount_type:
                              e.target.value === ""
                                ? null
                                : (e.target.value as "fixed" | "percentage"),
                          })
                        }
                      >
                        <option value="">
                          {deferBatchRules
                            ? "Not set (no batch discount — pick a type)"
                            : "Same as section 2 (batch default)"}
                        </option>
                        <option value="percentage">Percentage</option>
                        <option value="fixed">Fixed (PKR)</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Amount</Label>
                      <Input
                        inputMode="decimal"
                        placeholder={
                          deferBatchRules ? "Required to reserve for a customer" : "Leave empty for batch default"
                        }
                        value={
                          (overrideDraft[editRow.id] ?? emptyInstanceOverrides()).override_voucher_amount != null
                            ? String((overrideDraft[editRow.id] ?? emptyInstanceOverrides()).override_voucher_amount)
                            : ""
                        }
                        onChange={(e) => {
                          const t = e.target.value.trim();
                          if (t === "") {
                            patchOverride(editRow.id, { override_voucher_amount: null });
                            return;
                          }
                          const n = Number.parseFloat(t);
                          patchOverride(editRow.id, {
                            override_voucher_amount: Number.isNaN(n) ? null : n,
                          });
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Min. order (PKR)</Label>
                      <Input
                        inputMode="decimal"
                        placeholder={
                          deferBatchRules ? "Optional; batch min. order may apply" : "Leave empty for batch default"
                        }
                        value={
                          (overrideDraft[editRow.id] ?? emptyInstanceOverrides()).override_min_order_amount != null
                            ? String(
                                (overrideDraft[editRow.id] ?? emptyInstanceOverrides()).override_min_order_amount,
                              )
                            : ""
                        }
                        onChange={(e) => {
                          const t = e.target.value.trim();
                          if (t === "") {
                            patchOverride(editRow.id, { override_min_order_amount: null });
                            return;
                          }
                          const n = Number.parseFloat(t);
                          patchOverride(editRow.id, {
                            override_min_order_amount: Number.isNaN(n) ? null : n,
                          });
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Valid from</Label>
                      <DatetimePicker
                        value={
                          (overrideDraft[editRow.id] ?? emptyInstanceOverrides()).override_valid_from
                            ? toDatetimeLocalValue(
                                (overrideDraft[editRow.id] ?? emptyInstanceOverrides()).override_valid_from!,
                              )
                            : ""
                        }
                        onChange={(s) =>
                          patchOverride(editRow.id, {
                            override_valid_from: s ? new Date(s).toISOString() : null,
                          })
                        }
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Valid until</Label>
                      <DatetimePicker
                        value={
                          (overrideDraft[editRow.id] ?? emptyInstanceOverrides()).override_valid_until
                            ? toDatetimeLocalValue(
                                (overrideDraft[editRow.id] ?? emptyInstanceOverrides()).override_valid_until!,
                              )
                            : ""
                        }
                        onChange={(s) =>
                          patchOverride(editRow.id, {
                            override_valid_until: s ? new Date(s).toISOString() : null,
                          })
                        }
                        placeholder="Optional"
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label className="text-xs">Product scope</Label>
                      <RadioGroup
                        value={
                          (overrideDraft[editRow.id] ?? emptyInstanceOverrides()).override_product_scope === "all"
                            ? "all"
                            : (overrideDraft[editRow.id] ?? emptyInstanceOverrides()).override_product_scope ===
                                "specific"
                              ? "specific"
                              : "inherit"
                        }
                        onValueChange={(v) => {
                          if (v === "inherit") {
                            patchOverride(editRow.id, {
                              override_product_scope: null,
                              override_product_ids: null,
                            });
                            setOverrideProducts((prev) => {
                              const n = { ...prev };
                              delete n[editRow.id];
                              return n;
                            });
                          } else if (v === "all") {
                            patchOverride(editRow.id, {
                              override_product_scope: "all",
                              override_product_ids: [],
                            });
                          } else {
                            patchOverride(editRow.id, {
                              override_product_scope: "specific",
                              override_product_ids: [],
                            });
                            setOverrideProducts((prev) => ({
                              ...prev,
                              [editRow.id]: prev[editRow.id] ?? new Set<string>(),
                            }));
                          }
                        }}
                        className="flex flex-wrap gap-3"
                      >
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <RadioGroupItem value="inherit" id={`modal-ov-inherit-${editRow.id}`} />
                          {deferBatchRules ? "All products (batch default)" : "Same as section 2"}
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <RadioGroupItem value="all" id={`modal-ov-all-${editRow.id}`} />
                          All products
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-sm">
                          <RadioGroupItem value="specific" id={`modal-ov-spec-${editRow.id}`} />
                          Specific products
                        </label>
                      </RadioGroup>
                      {(overrideDraft[editRow.id] ?? emptyInstanceOverrides()).override_product_scope ===
                      "specific" ? (
                        <ProductMultiSelect
                          inputId={`modal-ov-products-${editRow.id}`}
                          products={products}
                          value={
                            overrideProducts[editRow.id] ??
                            (editRow.override_product_ids?.length
                              ? new Set(editRow.override_product_ids)
                              : new Set<string>())
                          }
                          onChange={(next) =>
                            setOverrideProducts((prev) => ({ ...prev, [editRow.id]: next }))
                          }
                          placeholder="Search products…"
                          aria-label="Override products for this code"
                        />
                      ) : null}
                    </div>
                  </div>
                </div>

                <DialogFooter className="gap-2 border-t bg-muted/30 p-4 sm:justify-between">
                  <Button type="button" variant="outline" onClick={() => setEditCodeInstanceId(null)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    disabled={assignBusy}
                    onClick={() => void onAssign(editRow.id)}
                  >
                    {assignBusy ? "Applying…" : "Apply changes"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            ) : null}
          </Dialog>
        </>
      ) : null}

      <div className="flex w-full max-w-none flex-wrap gap-3">
        <Button type="button" variant="destructive" onClick={() => void onDelete()}>
          Delete entire batch
        </Button>
      </div>
    </div>
  );
}
