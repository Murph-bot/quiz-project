import { createClient } from "@supabase/supabase-js";
import type { ToolContext } from "@lovable.dev/mcp-js";

function publishableKey(): string {
  const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;
  if (!key) throw new Error("The backend publishable key is not configured.");
  return key;
}

function projectUrl(): string {
  const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
  if (!url) throw new Error("The backend URL is not configured.");
  return url.replace(/\/+$/, "");
}

/**
 * A Supabase client acting as the signed-in MCP caller. RLS applies as that
 * user, so a tool can only ever reach rows the caller could reach in the app.
 */
export function supabaseForUser(ctx: ToolContext) {
  const token = ctx.getToken();
  if (!token) throw new Error("supabaseForUser requires a verified OAuth token");
  return createClient(projectUrl(), publishableKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
