import { supabase } from "@/lib/supabase/client";
import {
  getEcommerceStorageBucketId,
  publicMediaUrlsToObjectPaths,
} from "@/lib/supabase/storage-config";

/** Must match `contact-inquiry-upload.ts` folder segment. */
const CONTACT_INQUIRIES_PREFIX = "contact-inquiries/" as const;

function storagePathsForContactImages(imageUrls: string[]): string[] {
  const bucket = getEcommerceStorageBucketId();
  const paths = publicMediaUrlsToObjectPaths(imageUrls, bucket);
  return paths.filter((p) => p.startsWith(CONTACT_INQUIRIES_PREFIX));
}

export type ContactInquiryRow = {
  id: string;
  created_at: string;
  from_name: string;
  from_email: string;
  message: string;
  image_urls: string[];
  email_sent: boolean;
  email_error: string | null;
};

function parseImageUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.length > 0);
}

function mapRow(r: Record<string, unknown>): ContactInquiryRow {
  return {
    id: String(r.id ?? ""),
    created_at: String(r.created_at ?? ""),
    from_name: String(r.from_name ?? ""),
    from_email: String(r.from_email ?? ""),
    message: String(r.message ?? ""),
    image_urls: parseImageUrls(r.image_urls),
    email_sent: Boolean(r.email_sent),
    email_error: r.email_error == null ? null : String(r.email_error),
  };
}

export async function fetchContactInquiriesAdmin(limit = 200): Promise<ContactInquiryRow[]> {
  if (!supabase) return [];
  const cap = Math.min(Math.max(limit, 1), 500);
  const { data, error } = await supabase
    .from("contact_inquiries")
    .select("id, created_at, from_name, from_email, message, image_urls, email_sent, email_error")
    .order("created_at", { ascending: false })
    .limit(cap);

  if (error) {
    throw new Error(error.message);
  }
  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export async function fetchContactInquiryById(id: string): Promise<ContactInquiryRow | null> {
  if (!supabase || !id) return null;
  const { data, error } = await supabase
    .from("contact_inquiries")
    .select("id, created_at, from_name, from_email, message, image_urls, email_sent, email_error")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) return null;
  return mapRow(data as Record<string, unknown>);
}

/**
 * Deletes inquiry images from the public e-commerce bucket (paths derived from stored URLs),
 * then removes the `contact_inquiries` row. Requires active admin RLS + storage delete policy.
 */
export async function deleteContactInquiryAdmin(id: string, imageUrls: string[]): Promise<void> {
  if (!supabase || !id) {
    throw new Error("Database is not configured.");
  }
  const bucket = getEcommerceStorageBucketId();
  const paths = storagePathsForContactImages(imageUrls);

  if (paths.length > 0) {
    const { error: storageError } = await supabase.storage.from(bucket).remove(paths);
    if (storageError) {
      throw new Error(storageError.message);
    }
  }

  const { error } = await supabase.from("contact_inquiries").delete().eq("id", id);
  if (error) {
    throw new Error(error.message);
  }
}
