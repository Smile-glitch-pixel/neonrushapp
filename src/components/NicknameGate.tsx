import { useState } from "react";
import { NAME_RE } from "@/lib/profile.functions";

type Props = {
  tr: (k: string) => string;
  onSave: (name: string) => Promise<{ ok: boolean; reason?: string; name?: string }>;
  /** Absent en mode invité (rien à déconnecter). */
  onSignOut?: () => void;
  /** true = joueur non connecté (invité) : texte adapté. */
  guest?: boolean;
};

/** Écran bloquant : un pseudo unique est obligatoire pour jouer/apparaître au classement. */
export default function NicknameGate({ tr, onSave, onSignOut, guest = false }: Props) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const v = name.trim();
    if (!NAME_RE.test(v)) { setErr(tr("nickInvalid")); return; }
    setErr(null); setBusy(true);
    try {
      const r = await onSave(v);
      if (!r.ok) setErr(tr(r.reason === "TAKEN" ? "nickTaken" : "nickInvalid"));
    } catch {
      setErr(tr("nickInvalid"));
    } finally { setBusy(false); }
  };

  return (
    <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div className="panel-neon w-full max-w-sm rounded-2xl p-6 animate-scale-in">
        <div className="text-[10px] uppercase tracking-[0.4em] text-muted-foreground">{tr("ranked")}</div>
        <h2 className="mt-1 font-display text-2xl font-black text-glow-cyan">{tr("nickTitle")}</h2>
        <p className="mt-2 text-xs text-muted-foreground">{tr(guest ? "nickGuestDesc" : "nickDesc")}</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <input
            autoFocus value={name} onChange={(e) => { setName(e.target.value); setErr(null); }}
            placeholder={tr("nickPlaceholder")} maxLength={20}
            className="w-full rounded-lg border border-border/60 bg-black/40 px-4 py-3 text-sm text-foreground outline-none focus:border-[color:var(--neon-cyan)]"
          />
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{tr("nickRules")}</div>
          {err && <div className="text-xs text-glow-magenta">{err}</div>}
          <button
            type="submit" disabled={busy}
            className="w-full rounded-xl border border-[color:var(--neon-cyan)] bg-black/40 px-4 py-3 font-display text-sm font-black uppercase tracking-[0.25em] text-glow-cyan transition hover:scale-[1.02] disabled:opacity-50"
          >
            {tr("nickSave")}
          </button>
        </form>
        {onSignOut && (
          <button onClick={onSignOut} className="mt-4 w-full text-center text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-glow-magenta">
            {tr("signOut")}
          </button>
        )}
      </div>
    </div>
  );
}
