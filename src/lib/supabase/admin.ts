import { createClient } from "@supabase/supabase-js";

// Service-role client: bypasses RLS. Server code only (route handlers, the agent).
// Never import from a "use client" file; the key has no NEXT_PUBLIC_ prefix so it stays server-side.
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, key, { auth: { persistSession: false } });
}
