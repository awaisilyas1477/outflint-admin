/// <reference types="vite/client" />

declare module "react-rating-stars-component" {
  import type { FC } from "react";

  const ReactStars: FC<{
    count?: number;
    value?: number;
    size?: number;
    activeColor?: string;
    isHalf?: boolean;
    edit?: boolean;
    onChange?: (newRating: number) => void;
  }>;
  export default ReactStars;
}

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
  /** Display name in sidebar, login, copyright (optional) */
  readonly VITE_APP_NAME?: string;
  /** Subtitle under the app name, e.g. “Operations” (optional) */
  readonly VITE_APP_TAGLINE?: string;
  /** Marketing line on the sign-in brand column (optional) */
  readonly VITE_APP_DESCRIPTION?: string;
  /** Large heading on the sign-in brand panel (optional) */
  readonly VITE_APP_HERO_TITLE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
