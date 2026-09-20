import { useEffect, useId, useState, type FormEvent } from "react";
import { PageHeader } from "@/components/dashboard/page-header";
import { toast } from "sonner";
import { ADMIN_MSG_CATALOG_UNAVAILABLE } from "@/lib/admin-user-messages";
import {
  ADMIN_LIST_CARD_CLASS,
  ADMIN_LIST_CARD_HEADER_CLASS,
  ADMIN_LIST_CARD_CONTENT_CLASS,
  ADMIN_LIST_PAGE_CLASS,
} from "@/components/dashboard/admin-list-shell";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/auth-context";
import { supabase } from "@/lib/supabase/client";

export function ProfilePage() {
  const { user } = useAuth();
  const emailId = useId();
  const nameId = useId();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    queueMicrotask(() => {
      setEmail(user.email ?? "");
      const meta = user.user_metadata as Record<string, unknown>;
      const n =
        typeof meta.full_name === "string"
          ? meta.full_name
          : [meta.first_name, meta.last_name].filter(Boolean).join(" ");
      setFullName(typeof n === "string" ? n : "");
      setLoading(false);
    });
  }, [user]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) {
      toast.error(ADMIN_MSG_CATALOG_UNAVAILABLE);
      return;
    }
    setSaving(true);
    const { error: upErr } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim() },
    });
    setSaving(false);
    if (upErr) {
      toast.error(upErr.message);
      return;
    }
    toast.success("Profile updated.");
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Profile" />
        <p className="text-sm text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div className={ADMIN_LIST_PAGE_CLASS}>
      <PageHeader
        title="Profile"
        description="Your admin profile uses the same sign-in as the storefront. Email changes are managed in your authentication provider settings."
      />

      <Card className={cn(ADMIN_LIST_CARD_CLASS, "mx-auto w-full max-w-2xl")}>
        <CardHeader className={ADMIN_LIST_CARD_HEADER_CLASS}>
          <CardTitle>Account</CardTitle>
          <CardDescription>Display name is stored on the auth user record.</CardDescription>
        </CardHeader>
        <CardContent className={ADMIN_LIST_CARD_CONTENT_CLASS}>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={emailId}>Email</Label>
              <Input id={emailId} type="email" value={email} readOnly className="bg-muted/50" />
            </div>
            <div className="space-y-2">
              <Label htmlFor={nameId}>Full name</Label>
              <Input
                id={nameId}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
