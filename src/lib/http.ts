import { NextResponse } from "next/server";

/** Wraps a route handler: thrown errors become JSON with a status, never an HTML 500 page. */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A) => {
    try {
      return await fn(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const status = /Missing NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY/.test(message) ? 503 : 500;
      return NextResponse.json({ error: message }, { status });
    }
  };
}

export const bad = (error: string, status = 400) => NextResponse.json({ error }, { status });

export async function body(request: Request) {
  const value = await request.json().catch(() => null);
  return (value && typeof value === "object" ? value : {}) as Record<string, unknown>;
}
