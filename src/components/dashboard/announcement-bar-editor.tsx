import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { supabase } from "@/lib/supabase/client";
import { fetchHomePageSettings, saveAnnouncementBar } from "@/lib/supabase/home-marketing";
import { revalidateStorefront } from "@/lib/seo/revalidate";
import { ProductDescriptionEditor } from "@/components/dashboard/product-description-editor";

export function AnnouncementBarEditor() {
  const [loading, setLoading] = useState(true);
  const [announcementMessages, setAnnouncementMessages] = useState<string[]>([""]);
  const [announcementRotationSec, setAnnouncementRotationSec] = useState(5);
  const [announcementBg, setAnnouncementBg] = useState("#1c1d1d");
  const [announcementFg, setAnnouncementFg] = useState("#ffffff");
  const [announcementEnabled, setAnnouncementEnabled] = useState(true);
  const [savingAnnouncement, setSavingAnnouncement] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const home = await fetchHomePageSettings();
    if (home.error) {
      toast.error(home.error);
    }
    if (home.data) {
      setAnnouncementMessages(
        home.data.announcementMessages.length > 0
          ? home.data.announcementMessages
          : [""],
      );
      setAnnouncementRotationSec(home.data.announcementRotationSec);
      setAnnouncementBg(home.data.announcementBg);
      setAnnouncementFg(home.data.announcementFg);
      setAnnouncementEnabled(home.data.announcementEnabled);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      void load();
    });
  }, [load]);

  async function onSaveAnnouncement(e: FormEvent) {
    e.preventDefault();
    setSavingAnnouncement(true);
    const result = await saveAnnouncementBar({
      announcement_messages: announcementMessages,
      announcement_bar_bg: announcementBg,
      announcement_bar_fg: announcementFg,
      announcement_enabled: announcementEnabled,
      announcement_rotation_sec: announcementRotationSec,
    });
    setSavingAnnouncement(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Announcement bar saved.");
    // Bust the storefront's announcement-bar cache tag so the new copy
    // appears on the live site immediately, not after the 5-min TTL.
    void revalidateStorefront({ all: true });
  }

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground">Loading announcement settings…</p>
    );
  }

  const colorPickerBg =
    /^#[0-9A-Fa-f]{6}$/i.test(announcementBg.trim()) ? announcementBg.trim() : "#1c1d1d";
  const colorPickerFg =
    /^#[0-9A-Fa-f]{6}$/i.test(announcementFg.trim()) ? announcementFg.trim() : "#ffffff";

  return (
    <form onSubmit={(e) => void onSaveAnnouncement(e)} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Announcement bar</CardTitle>
          <CardDescription>
            Full-width strip above the header on every page. Add one or more messages (same editor as
            product long description); the storefront crossfades between them on a loop every few
            seconds. If every message is empty, the catalog / env line is shown as plain text. Turn
            off below to hide the strip entirely.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex items-center gap-2 text-sm font-medium leading-none">
            <Checkbox
              checked={announcementEnabled}
              onCheckedChange={(c) => setAnnouncementEnabled(c === true)}
            />
            Show announcement bar on storefront
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ann-bg">Background</Label>
              <div className="flex items-center gap-2">
                <input
                  id="ann-bg"
                  type="color"
                  value={colorPickerBg}
                  onChange={(e) => setAnnouncementBg(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-input bg-background p-1"
                  aria-label="Background color"
                />
                <Input
                  value={announcementBg}
                  onChange={(e) => setAnnouncementBg(e.target.value)}
                  placeholder="#1c1d1d"
                  spellCheck={false}
                  autoComplete="off"
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ann-fg">Text &amp; links</Label>
              <div className="flex items-center gap-2">
                <input
                  id="ann-fg"
                  type="color"
                  value={colorPickerFg}
                  onChange={(e) => setAnnouncementFg(e.target.value)}
                  className="h-10 w-14 cursor-pointer rounded border border-input bg-background p-1"
                  aria-label="Text color"
                />
                <Input
                  value={announcementFg}
                  onChange={(e) => setAnnouncementFg(e.target.value)}
                  placeholder="#ffffff"
                  spellCheck={false}
                  autoComplete="off"
                  className="font-mono text-sm"
                />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="ann-rotation">Seconds between messages</Label>
            <Input
              id="ann-rotation"
              type="number"
              min={3}
              max={12}
              step={1}
              className="max-w-[120px]"
              value={announcementRotationSec}
              onChange={(e) => {
                const n = Number.parseInt(e.target.value, 10);
                setAnnouncementRotationSec(
                  Number.isNaN(n) ? 5 : Math.min(12, Math.max(3, n)),
                );
              }}
            />
            <p className="text-xs text-muted-foreground">
              Rotates through all messages in order (3–12 seconds each), then loops.
            </p>
          </div>
          <div className="space-y-4">
            {announcementMessages.map((msg, i) => (
              <div
                key={i}
                className="space-y-2 rounded-lg border border-border bg-muted/20 p-3 sm:p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor={`announcement-msg-${i}`} className="text-sm font-medium">
                    Message {i + 1}
                  </Label>
                  {announcementMessages.length > 1 ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-8 text-destructive hover:text-destructive"
                      onClick={() =>
                        setAnnouncementMessages((prev) => prev.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2 className="mr-1 h-4 w-4" aria-hidden />
                      Remove
                    </Button>
                  ) : null}
                </div>
                <ProductDescriptionEditor
                  id={`announcement-msg-${i}`}
                  value={msg}
                  onChange={(html) => {
                    setAnnouncementMessages((prev) => {
                      const next = [...prev];
                      next[i] = html;
                      return next;
                    });
                  }}
                  placeholder="e.g. Free shipping over Rs 5,000"
                />
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="w-full sm:w-auto"
              onClick={() => setAnnouncementMessages((prev) => [...prev, ""])}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              Add message
            </Button>
          </div>
          <div
            className="rounded-md border border-border px-3 py-2 text-[13px] font-medium leading-snug"
            style={{
              backgroundColor: announcementBg,
              color: announcementFg,
            }}
          >
            <span
              className="mb-1 block text-xs font-normal"
              style={{ color: announcementFg, opacity: 0.75 }}
            >
              Preview
            </span>
            <span style={{ opacity: 0.95 }}>Sample text uses your colors.</span>
          </div>
          <Button type="submit" disabled={savingAnnouncement}>
            {savingAnnouncement ? "Saving…" : "Save announcement bar"}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
}
