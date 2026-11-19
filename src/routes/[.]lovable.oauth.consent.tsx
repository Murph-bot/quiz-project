import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { approveAuthorization, denyAuthorization, getAuthorizationDetails } from "@/lib/oauth-client";
import { KnightMark } from "@/components/knight";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/.lovable/oauth/consent")({
  staticData: { sitemap: false },
  // SSR has no localStorage session and would redirect signed-in users.
  ssr: false,
  head: () => ({ meta: [
    { title: "Authorize access — Quiz_Knight" },
    { name: "description", content: "Approve or deny an assistant's request to use Quiz_Knight on your behalf." },
    { property: "og:title", content: "Authorize access — Quiz_Knight" },
    { property: "og:description", content: "Review an assistant's request for access to Quiz_Knight." },
    { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex" },
  ] }),
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s["authorization_id"] === "string" ? s["authorization_id"] : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/login", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await getAuthorizationDetails(authorizationId);
    if (error) throw error;
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="app-shell">
      <header className="site-header"><a href="/" className="wordmark"><KnightMark /><span>QUIZ<span className="text-primary">_</span>KNIGHT</span></a></header>
      <div className="entry-stage"><div className="join-panel"><h1 className="font-display text-3xl">This authorization request can't be shown</h1>
        <p className="error-message" role="alert">{error instanceof Error ? error.message : String(error)}</p></div></div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clientName = details?.client?.name ?? "an assistant";

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = approve ? await approveAuthorization(authorization_id) : await denyAuthorization(authorization_id);
      if (error) { setError(error.message); setBusy(false); return; }
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) { setError("The authorization server returned no redirect."); setBusy(false); return; }
      window.location.href = target;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Could not record your choice.");
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="site-header"><a href="/" className="wordmark"><KnightMark /><span>QUIZ<span className="text-primary">_</span>KNIGHT</span></a></header>
      <div className="entry-stage">
        <div className="join-panel" style={{ maxWidth: 520, margin: "0 auto" }}>
          <div className="panel-topline"><span>AGENT INTEGRATION</span><KnightMark /></div>
          <h1 className="font-display text-3xl mt-5">Let {clientName} use Quiz_Knight as you?</h1>
          <p className="text-muted-foreground text-sm mt-3">
            It can explain the rules, compare the game paces, describe the question bank and see which account it is signed in as.
            It cannot see question answers, room contents or other players.
          </p>
          {error && <p className="error-message" role="alert">{error}</p>}
          <div className="grid gap-3 mt-6">
            <Button disabled={busy} onClick={() => decide(true)}>Approve</Button>
            <Button disabled={busy} variant="outline" onClick={() => decide(false)}>Deny</Button>
          </div>
        </div>
      </div>
    </main>
  );
}
