import { Link } from "@tanstack/react-router";
import type { useDuo } from "@/hooks/useDuo";
import type { DuoPlayer } from "@/lib/duo.functions";

type Duo = ReturnType<typeof useDuo>;

const ERR_KEY: Record<string, string> = {
  ROOM_NOT_FOUND: "duoNotFound",
  ROOM_FULL: "duoFull",
  ROOM_OWN: "duoOwn",
  ROOM_CLOSED: "duoClosed",
  ROOM_EXPIRED: "duoExpired",
  AUTH_REQUIRED: "duoAuth",
};

const STATE_KEY: Record<string, string> = {
  alive: "duoAlive",
  down: "duoDown",
  dead: "duoDead",
  disconnected: "duoDisconnected",
};

function fmtTime(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Slot({ p, label, color, glow, tr }: { p: DuoPlayer | null; label: string; color: string; glow: string; tr: (k: string) => string }) {
  return (
    <div className="rounded-xl border bg-black/30 p-4 text-center" style={{ borderColor: `color-mix(in oklab, ${color} 50%, transparent)` }}>
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
      <div className={`mt-1 truncate font-display text-sm font-black uppercase tracking-widest ${glow}`}>
        {p ? (p.display_name || "Player") : "—"}
      </div>
      {p && (
        <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {tr(STATE_KEY[p.state] ?? "duoAlive")}
        </div>
      )}
    </div>
  );
}

export default function DuoLobby({
  duo, tr, signedIn, code, setCode, onCopy, onClose, teamRecord,
}: {
  duo: Duo;
  tr: (k: string) => string;
  signedIn: boolean;
  code: string;
  setCode: (v: string) => void;
  onCopy: (code: string) => void;
  onClose: () => void;
  teamRecord: number;
}) {
  const { room, me, partner, isHost, busy, error, result } = duo;

  if (!signedIn) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-muted-foreground">{tr("duoDesc")}</p>
        <p className="text-xs uppercase tracking-[0.2em] text-glow-magenta">{tr("duoAuth")}</p>
        <Link to="/auth" className="block rounded-xl border border-[color:var(--neon-cyan)] bg-[color:var(--neon-cyan)]/10 px-6 py-3 font-display text-sm font-black uppercase tracking-[0.3em] text-glow-cyan">
          ☁ {tr("signIn")}
        </Link>
      </div>
    );
  }

  /* ---------- Résultat coopératif : aucun vainqueur, aucun perdant ---------- */
  if (result) {
    const isRecord = result.settled && result.teamScore > 0 && result.teamScore >= teamRecord;
    return (
      <div className="space-y-4 text-center animate-scale-in">
        <div className="font-display text-2xl font-black uppercase tracking-[0.2em] text-glow-cyan">🤝 {tr("duoEnd")}</div>
        {!result.settled && (
          <div className="text-[11px] uppercase tracking-[0.25em] text-glow-yellow animate-pulse">{tr("duoWaitResult")}</div>
        )}
        {isRecord && (
          <div className="pulse-glow rounded-xl border border-[color:var(--neon-yellow)]/70 bg-[color:var(--neon-yellow)]/10 py-2 font-display text-sm font-black uppercase tracking-[0.25em] text-glow-yellow">
            ★ {tr("duoRecord")}
          </div>
        )}

        <div className="rounded-2xl border border-[color:var(--neon-cyan)]/60 bg-black/40 p-5">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{tr("duoTeamScore")}</div>
          <div className="font-display text-5xl font-black text-glow-cyan tabular-nums">{result.teamScore}</div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[10px] uppercase tracking-[0.2em]">
          <div className="rounded-xl border border-border/50 bg-black/30 p-3">
            <div className="text-muted-foreground">{tr("duoSurvived")}</div>
            <div className="mt-1 font-display text-lg font-black text-glow-yellow tabular-nums">{fmtTime(result.survivedMs)}</div>
          </div>
          <div className="rounded-xl border border-border/50 bg-black/30 p-3">
            <div className="text-muted-foreground">{tr("duoRevives")}</div>
            <div className="mt-1 font-display text-lg font-black text-glow-magenta tabular-nums">{result.revives}</div>
          </div>
          <div className="rounded-xl border border-border/50 bg-black/30 p-3">
            <div className="text-muted-foreground">{tr("duoContribution")}</div>
            <div className="mt-1 font-display text-lg font-black text-glow-cyan tabular-nums">{result.myContribution}</div>
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={() => { duo.setResult(null); duo.leave(); }} className="flex-1 panel-neon rounded-xl py-3 text-xs font-bold uppercase tracking-[0.25em] text-glow-yellow">
            {tr("duoRematch")}
          </button>
          <button onClick={() => { duo.setResult(null); duo.leave(); onClose(); }} className="flex-1 panel-neon rounded-xl py-3 text-xs font-bold uppercase tracking-[0.25em] text-glow-magenta">
            {tr("back")}
          </button>
        </div>
      </div>
    );
  }

  /* ---------- Création / rejoindre ---------- */
  if (!room) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground text-center">{tr("duoDesc")}</p>
        {teamRecord > 0 && (
          <div className="text-center text-[10px] uppercase tracking-[0.25em] text-glow-yellow">
            ★ {tr("duoTeamScore")} : {teamRecord}
          </div>
        )}
        <button
          onClick={() => duo.create()}
          disabled={busy}
          className="w-full rounded-xl border border-[color:var(--neon-cyan)] bg-gradient-to-r from-[color:var(--neon-cyan)]/20 to-[color:var(--neon-magenta)]/20 px-6 py-4 font-display text-base font-black uppercase tracking-[0.3em] text-glow-cyan transition hover:scale-[1.02] disabled:opacity-50"
        >
          🤝 {tr("duoCreate")}
        </button>
        <div className="flex gap-2">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 6))}
            placeholder={tr("duoCode")}
            inputMode="text"
            autoCapitalize="characters"
            className="flex-1 rounded-xl border border-border/60 bg-black/40 px-4 py-3 text-center font-display text-lg font-black uppercase tracking-[0.4em] text-glow-yellow outline-none focus:border-[color:var(--neon-yellow)]"
          />
          <button
            onClick={() => duo.join(code)}
            disabled={busy || code.trim().length < 4}
            className="rounded-xl border border-[color:var(--neon-magenta)] bg-[color:var(--neon-magenta)]/10 px-5 font-display text-xs font-black uppercase tracking-[0.25em] text-glow-magenta disabled:opacity-40"
          >
            {tr("duoJoin")}
          </button>
        </div>
        {error && <div className="text-center text-[11px] uppercase tracking-[0.2em] text-glow-magenta">{tr(ERR_KEY[error] ?? "duoNotFound")}</div>}
      </div>
    );
  }

  /* ---------- Salle d'attente de l'escouade ---------- */
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[color:var(--neon-yellow)]/50 bg-black/30 p-4 text-center">
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{tr("duoCode")}</div>
        <div className="font-display text-4xl font-black tracking-[0.35em] text-glow-yellow">{room.code}</div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{tr("duoCodeHint")}</div>
        <button onClick={() => onCopy(room.code)} className="panel-neon mt-3 rounded-lg px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-glow-cyan">
          ⧉ {tr("duoCopy")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Slot p={me} label={tr("duoYou")} color="var(--neon-cyan)" glow="text-glow-cyan" tr={tr} />
        <Slot p={partner} label={tr("duoPartner")} color="var(--neon-magenta)" glow="text-glow-magenta" tr={tr} />
      </div>

      {!partner && <div className="text-center text-[11px] uppercase tracking-[0.25em] text-glow-cyan animate-pulse">{tr("duoWaiting")}</div>}

      {partner && room.status !== "playing" && (
        <>
          <div className="text-center text-[11px] uppercase tracking-[0.25em] text-glow-yellow">{tr("duoReady")}</div>
          {isHost ? (
            <button
              onClick={() => duo.startMatch()}
              disabled={busy}
              className="w-full rounded-xl border border-[color:var(--neon-cyan)] bg-gradient-to-r from-[color:var(--neon-cyan)]/25 to-[color:var(--neon-magenta)]/25 px-6 py-4 font-display text-base font-black uppercase tracking-[0.3em] text-glow-cyan transition hover:scale-[1.02] disabled:opacity-50"
            >
              ▶ {tr("duoStart")}
            </button>
          ) : (
            <div className="text-center text-[11px] uppercase tracking-[0.25em] text-muted-foreground animate-pulse">{tr("duoWaitHost")}</div>
          )}
        </>
      )}

      <button onClick={() => { duo.leave(); onClose(); }} className="w-full panel-neon rounded-xl py-3 text-[11px] font-bold uppercase tracking-[0.25em] text-glow-magenta">
        ✕ {tr("duoLeave")}
      </button>
      {error && <div className="text-center text-[11px] uppercase tracking-[0.2em] text-glow-magenta">{tr(ERR_KEY[error] ?? "duoNotFound")}</div>}
    </div>
  );
}
