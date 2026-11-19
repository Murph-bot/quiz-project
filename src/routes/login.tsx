import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight, Mail, Shield, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { oauthReturnPath } from "@/lib/oauth-return-path";
import { KnightMark } from "@/components/knight";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/login")({
  staticData: { sitemap: false },
  ssr: false,
  head: () => ({ meta: [
    { title: "Sign in — Quiz_Knight" },
    { name: "description", content: "Sign in or create a Quiz_Knight account so an assistant can use the game on your behalf." },
    { name: "robots", content: "noindex" },
  ] }),
  validateSearch: (s: Record<string, unknown>) => ({ next: typeof s["next"] === "string" ? s["next"] : "/" }),
  component: Login,
});

function Login() {
  const { next } = Route.useSearch();
  const target = oauthReturnPath(next);
  const absolute = new URL(target, window.location.origin).href;
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [note, setNote] = useState("");

  async function finish() {
    window.location.href = target;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setNote("");
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await finish();
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: absolute } });
        if (error) throw error;
        if (data.session) await finish();
        else setNote("Check your inbox and confirm your address, then sign in.");
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function withProvider(provider: "google" | "lovable") {
    setBusy(true); setError(""); setNote("");
    try {
      // The generated client types don't list the Lovable provider yet, but the
      // backend has it enabled, so narrow the credentials object at the boundary.
      const credentials = { provider, options: { redirectTo: absolute } } as unknown as Parameters<typeof supabase.auth.signInWithOAuth>[0];
      const { error } = await supabase.auth.signInWithOAuth(credentials);
      if (error) throw error;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="site-header"><a href="/" className="wordmark"><KnightMark /><span>QUIZ<span className="text-primary">_</span>KNIGHT</span></a></header>
      <div className="entry-stage">
        <div className="join-panel" style={{ maxWidth: 520, margin: "0 auto" }}>
          <div className="panel-topline"><span>{mode === "signin" ? "WELCOME BACK" : "JOIN THE LEDGER"}</span><Sparkles /></div>
          <h1 className="font-display text-3xl mt-5">{mode === "signin" ? "Sign in to your account" : "Create an account"}</h1>
          <p className="text-muted-foreground text-sm mt-2">
            Accounts exist so an assistant can be given permission to use Quiz_Knight as you. Games themselves still need nothing but a nickname.
          </p>
          <div className="mode-switch">
            <Button variant="ghost" className={mode === "signin" ? "selected" : ""} onClick={() => { setMode("signin"); setError(""); setNote(""); }}>Sign in</Button>
            <Button variant="ghost" className={mode === "signup" ? "selected" : ""} onClick={() => { setMode("signup"); setError(""); setNote(""); }}>Sign up</Button>
          </div>
          <form onSubmit={submit}>
            <label htmlFor="email">Email</label>
            <div className="input-wrap"><Mail /><input id="email" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="email" placeholder="you@example.com" /></div>
            <label htmlFor="password">Password</label>
            <div className="input-wrap"><Shield /><input id="password" type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} autoComplete={mode === "signin" ? "current-password" : "new-password"} placeholder="At least 6 characters" /></div>
            {error && <p className="error-message" role="alert">{error}</p>}
            {note && <p className="text-muted-foreground text-sm mt-3" role="status">{note}</p>}
            <Button className="quest-button" type="submit" disabled={busy || !email.trim() || password.length < 6}>
              {busy ? "One moment…" : mode === "signin" ? "Sign in" : "Create account"}<ArrowRight />
            </Button>
          </form>
          <div className="panel-foot"><i /><span>Or continue with</span><i /></div>
          <div className="grid gap-3 mt-3">
            <Button variant="outline" disabled={busy} onClick={() => withProvider("google")}>Continue with Google</Button>
            <Button variant="outline" disabled={busy} onClick={() => withProvider("lovable")}>Continue with Lovable</Button>
          </div>
          <p className="panel-foot"><a className="text-primary" href="/">Back to game night</a></p>
        </div>
      </div>
    </main>
  );
}
