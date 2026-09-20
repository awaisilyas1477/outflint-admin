import { Outlet } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import {
  APP_DESCRIPTION,
  APP_HERO_TITLE,
  APP_LOGO_SRC,
  APP_NAME,
  APP_TAGLINE,
} from "@/config/brand";

function BrandMark({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex flex-col gap-2 text-left">
        <img
          src={APP_LOGO_SRC}
          alt={APP_NAME}
          className="h-10 w-auto max-w-[240px] object-contain object-left dark:invert"
        />
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
          {APP_TAGLINE}
        </p>
      </div>
    </div>
  );
}

export function AuthLayout() {
  return (
    <div className="min-h-screen bg-background lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Brand panel — desktop */}
      <aside className="relative hidden overflow-hidden border-r border-border/60 bg-card lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_20%_-10%,hsl(var(--primary)/0.18),transparent),radial-gradient(ellipse_60%_50%_at_80%_100%,hsl(var(--primary)/0.08),transparent)]"
          aria-hidden
        />
        <div className="relative z-10 space-y-8">
          <BrandMark />
          <div className="space-y-4">
            <h2 className="max-w-sm text-3xl font-semibold leading-tight tracking-tight text-foreground">
              {APP_HERO_TITLE}
            </h2>
            <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
              {APP_DESCRIPTION}
            </p>
          </div>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              Role-based access and audit-friendly sessions
            </li>
            <li className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              Encrypted sign-in; your credentials never leave this flow
            </li>
          </ul>
        </div>
        <p className="relative z-10 text-xs text-muted-foreground/80">
          © {new Date().getFullYear()} {APP_NAME}
        </p>
      </aside>

      {/* Form column */}
      <div className="flex min-h-screen flex-col">
        <header className="border-b border-border/60 bg-card/80 px-6 py-5 backdrop-blur supports-[backdrop-filter]:bg-card/60 lg:hidden">
          <BrandMark />
        </header>
        <div className="flex flex-1 flex-col justify-center px-4 py-10 sm:px-8">
          <div className="mx-auto w-full max-w-[400px]">
            <Outlet />
          </div>
        </div>
      </div>
    </div>
  );
}
