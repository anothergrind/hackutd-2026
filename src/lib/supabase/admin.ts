import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { memoryDb } from "./memory";

export const usingMemoryDb = () => !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY;

// Service-role client: bypasses RLS. Server code only (route handlers, the agents).
// Never import from a "use client" file; the key has no NEXT_PUBLIC_ prefix so it stays server-side.
// With no Supabase env vars, falls back to the in-memory demo database so the app still runs.
export function createSupabaseAdminClient(): SupabaseClient {
  if (usingMemoryDb()) return memoryDb();
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
}
