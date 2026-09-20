/** Matches `public.admins` in the storefront database. */
export type AdminRow = {
  id: string;
  auth_id: string;
  email: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
};
