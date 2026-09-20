import { supabase } from "@/lib/supabase/client";

import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
export type HomeHeroSlideRow = {
  id: string;
  sort_order: number;
  title: string;
  image_url: string;
  href: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type HomePageSettingsPayload = {
  mission: string;
  /** Rich HTML segments for the rotating announcement bar. */
  announcementMessages: string[];
  /** Legacy single field; first message or empty. */
  announcementHtml: string;
  announcementBg: string;
  announcementFg: string;
  announcementEnabled: boolean;
  /** Seconds between rotations (3–12); stored in DB as ms. */
  announcementRotationSec: number;
};

export async function fetchHomePageSettings(): Promise<{
  data: HomePageSettingsPayload | null;
  error?: string;
}> {
  if (!supabase) {
    return { data: null, error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const { data, error } = await supabase
    .from("home_page_settings")
    .select(
      "mission_paragraph, announcement_html, announcement_messages, announcement_rotation_ms, announcement_bar_bg, announcement_bar_fg, announcement_enabled",
    )
    .eq("id", 1)
    .maybeSingle();
  if (error) {
    return { data: null, error: error.message };
  }

  if (!data) {
    return {
      data: {
        mission: "",
        announcementMessages: [""],
        announcementHtml: "",
        announcementBg: "#1c1d1d",
        announcementFg: "#ffffff",
        announcementEnabled: true,
        announcementRotationSec: 5,
      },
    };
  }

  const rawMsgs = data.announcement_messages;
  let announcementMessages: string[] = [""];
  if (Array.isArray(rawMsgs) && rawMsgs.length > 0) {
    announcementMessages = rawMsgs.map((x: unknown) =>
      typeof x === "string" ? x : String(x ?? ""),
    );
  } else if (data.announcement_html && String(data.announcement_html).trim()) {
    announcementMessages = [String(data.announcement_html)];
  }

  const rawMs = data.announcement_rotation_ms;
  const ms =
    typeof rawMs === "number" && Number.isFinite(rawMs)
      ? rawMs
      : Number(rawMs);
  const clampedMs =
    !Number.isFinite(ms) || ms < 3000 ? 5000 : Math.min(12000, Math.max(3000, Math.round(ms)));
  const announcementRotationSec = clampedMs / 1000;

  return {
    data: {
      mission: data.mission_paragraph ?? "",
      announcementMessages,
      announcementHtml: data.announcement_html ?? "",
      announcementBg: data.announcement_bar_bg ?? "#1c1d1d",
      announcementFg: data.announcement_bar_fg ?? "#ffffff",
      announcementEnabled: data.announcement_enabled !== false,
      announcementRotationSec,
    },
  };
}

export async function saveMissionParagraph(
  mission_paragraph: string,
): Promise<{ error?: string }> {
  if (!supabase) {
    return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const { error } = await supabase
    .from("home_page_settings")
    .update({
      mission_paragraph,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) {
    return { error: error.message };
  }
  return {};
}

function normalizeHex(input: string, fallback: string): string {
  const t = input.trim();
  if (/^#[0-9A-Fa-f]{6}$/i.test(t)) return t;
  if (/^#[0-9A-Fa-f]{3}$/i.test(t)) {
    const h = t.slice(1);
    return `#${h[0]}${h[0]}${h[1]}${h[1]}${h[2]}${h[2]}`;
  }
  return fallback;
}

function clampRotationSec(sec: number): number {
  if (!Number.isFinite(sec)) return 5;
  return Math.min(12, Math.max(3, Math.round(sec)));
}

export async function saveAnnouncementBar(payload: {
  announcement_messages: string[];
  announcement_bar_bg: string;
  announcement_bar_fg: string;
  announcement_enabled: boolean;
  announcement_rotation_sec: number;
}): Promise<{ error?: string }> {
  if (!supabase) {
    return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const bg = normalizeHex(payload.announcement_bar_bg, "#1c1d1d");
  const fg = normalizeHex(payload.announcement_bar_fg, "#ffffff");
  const rotationMs = clampRotationSec(payload.announcement_rotation_sec) * 1000;
  const firstHtml = payload.announcement_messages[0] ?? "";
  const { error } = await supabase
    .from("home_page_settings")
    .update({
      announcement_messages: payload.announcement_messages,
      announcement_rotation_ms: rotationMs,
      announcement_html: firstHtml,
      announcement_bar_bg: bg,
      announcement_bar_fg: fg,
      announcement_enabled: payload.announcement_enabled,
      updated_at: new Date().toISOString(),
    })
    .eq("id", 1);
  if (error) {
    return { error: error.message };
  }
  return {};
}

export async function fetchHomeHeroSlidesAdmin(): Promise<{
  rows: HomeHeroSlideRow[];
  error?: string;
}> {
  if (!supabase) {
    return { rows: [], error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const { data, error } = await supabase
    .from("home_hero_slides")
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) {
    return { rows: [], error: error.message };
  }
  return { rows: (data as HomeHeroSlideRow[]) ?? [] };
}

export async function insertHomeHeroSlide(initial: {
  title: string;
  image_url: string;
  href: string;
  sort_order: number;
  is_active: boolean;
}): Promise<{ id?: string; error?: string }> {
  if (!supabase) {
    return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("home_hero_slides")
    .insert({
      ...initial,
      updated_at: now,
    })
    .select("id")
    .single();
  if (error) {
    return { error: error.message };
  }
  return { id: data?.id };
}

export async function updateHomeHeroSlide(
  id: string,
  patch: Partial<
    Pick<HomeHeroSlideRow, "title" | "image_url" | "href" | "sort_order" | "is_active">
  >,
): Promise<{ error?: string }> {
  if (!supabase) {
    return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const { error } = await supabase
    .from("home_hero_slides")
    .update({
      ...patch,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) {
    return { error: error.message };
  }
  return {};
}

export async function deleteHomeHeroSlide(id: string): Promise<{ error?: string }> {
  if (!supabase) {
    return { error: ADMIN_MSG_CATALOG_UNAVAILABLE };
  }
  const { error } = await supabase.from("home_hero_slides").delete().eq("id", id);
  if (error) {
    return { error: error.message };
  }
  return {};
}
