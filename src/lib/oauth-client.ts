import { supabase } from "@/integrations/supabase/client";

export type OAuthClientInfo = { name?: string; client_id?: string } | null;

export type AuthorizationDetails = {
  client?: OAuthClientInfo;
  redirect_url?: string | null;
  redirect_to?: string | null;
};

export type AuthorizationDecision = { redirect_url?: string | null; redirect_to?: string | null };

type OAuthNamespace = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthorizationDetails | null; error: Error | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthorizationDecision | null; error: Error | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthorizationDecision | null; error: Error | null }>;
};

// The beta `supabase.auth.oauth` namespace is not in the generated types yet.
const oauth = (supabase.auth as unknown as { oauth?: OAuthNamespace }).oauth;

function requireOAuth(): OAuthNamespace {
  if (!oauth) throw new Error("This backend does not expose an OAuth authorization server yet.");
  return oauth;
}

export function getAuthorizationDetails(authorizationId: string) {
  return requireOAuth().getAuthorizationDetails(authorizationId);
}

export function approveAuthorization(authorizationId: string) {
  return requireOAuth().approveAuthorization(authorizationId);
}

export function denyAuthorization(authorizationId: string) {
  return requireOAuth().denyAuthorization(authorizationId);
}
