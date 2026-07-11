import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "NEON RUSH — Compte" },
      { name: "description", content: "Connecte-toi pour synchroniser ta progression NEON RUSH sur tous tes appareils." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") navigate({ to: "/" });
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [navigate]);

  const google = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (r.error) setErr(r.error.message || "Erreur Google");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur Google");
    } finally { setBusy(false); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
        setMsg("Vérifie ton email pour confirmer ton compte.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Erreur");
    } finally { setBusy(false); }
  };

  return (
    <main className="scanlines relative min-h-screen w-full overflow-hidden flex items-center justify-center p-4">
      <div className="scanlines-overlay pointer-events-none absolute inset-0" />
      <div className="panel-neon w-full max-w-md rounded-2xl p-6 sm:p-8 animate-fade-in">
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">Compte joueur</div>
          <h1 className="mt-1 font-display text-3xl font-black">
            <span className="text-glow-cyan">NEON</span> <span className="text-glow-magenta">RUSH</span>
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">Synchronise ta progression sur tous tes appareils.</p>
        </div>

        <button
          onClick={google} disabled={busy}
          className="mt-6 w-full rounded-xl border border-[color:var(--neon-cyan)] bg-black/40 px-4 py-3 font-display text-sm font-bold uppercase tracking-[0.25em] text-glow-cyan transition hover:scale-[1.02] disabled:opacity-50"
        >
          Continuer avec Google
        </button>

        <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          <span className="h-px flex-1 bg-border/50" /> ou <span className="h-px flex-1 bg-border/50" />
        </div>

        <form onSubmit={submit} className="space-y-3">
          <input
            type="email" required autoComplete="email" placeholder="Email"
            value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border/60 bg-black/40 px-4 py-3 text-sm text-foreground outline-none focus:border-[color:var(--neon-cyan)]"
          />
          <input
            type="password" required autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="Mot de passe" minLength={6}
            value={password} onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-border/60 bg-black/40 px-4 py-3 text-sm text-foreground outline-none focus:border-[color:var(--neon-cyan)]"
          />
          {err && <div className="text-xs text-destructive">{err}</div>}
          {msg && <div className="text-xs text-glow-yellow">{msg}</div>}
          <button
            type="submit" disabled={busy}
            className="w-full rounded-xl border border-[color:var(--neon-magenta)] bg-gradient-to-r from-[color:var(--neon-cyan)]/20 to-[color:var(--neon-magenta)]/20 px-4 py-3 font-display text-sm font-black uppercase tracking-[0.25em] text-glow-magenta transition hover:scale-[1.02] disabled:opacity-50"
          >
            {mode === "signin" ? "Se connecter" : "Créer un compte"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs">
          <button onClick={() => setMode(mode === "signin" ? "signup" : "signin")} className="text-glow-cyan hover:underline">
            {mode === "signin" ? "Pas encore de compte ? Créer un compte" : "Déjà un compte ? Se connecter"}
          </button>
        </div>

        <div className="mt-6 text-center">
          <Link to="/" className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-glow-yellow">
            ← Continuer sans compte
          </Link>
        </div>

        <div className="mt-6 text-center text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          Discord — bientôt disponible
        </div>
      </div>
    </main>
  );
}
