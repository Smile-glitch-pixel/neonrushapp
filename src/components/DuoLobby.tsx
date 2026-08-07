import { Link } from "@tanstack/react-router";
import type { useDuo } from "@/hooks/useDuo";

type Duo = ReturnType<typeof useDuo>;

const ERR_KEY: Record<string, string> = {
  ROOM_NOT_FOUND: "duoNotFound",
  ROOM_FULL: "duoFull",
  ROOM_OWN: "duoOwn",
  ROOM_CLOSED: "duoClosed",
  ROOM_EXPIRED: "duoExpired",
  AUTH_REQUIRED: "duoAuth",
};

export default function DuoLobby({
  duo, tr, signedIn, code, setCode, onCopy, onClose,
}: {
  duo: Duo;
  tr: (k: string) => string;
  signedIn: boolean;
  code: string;
  setCode: (v: string) => void;
  onCopy: (code: string) => void;
  onClose: () => void;
}) {
  const { room, me, opponent, isHost, busy, error, result } = duo;

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

  if (result) {
    const label = result.result === "win" ? tr("duoWin") : result.result === "loss" ? tr("duoLoss") : tr("duoDraw");
    const color = result.result === "win" ? "text-glow-cyan" : result.result === "loss" ? "text-glow-magenta" : "text-glow-yellow";
    return (
      <div className="space-y-4 text-center animate-scale-in">
        <div className={`font-display text-4xl font-black uppercase tracking-[0.2em] ${color}`}>{label}</div>
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border border-[color:var(--neon-cyan)]/50 bg-black/30 p-4">
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{tr("duoYou")}</div>
            <div className="font-display text-3xl font-black text-glow-cyan tabular-nums">{result.myScore}</div>
          </div>
          <div className="rounded-xl border border-[color:var(--neon-magenta)]/50 bg-black/30 p-4">
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{tr("duoOpponent")}</div>
            <div className="font-display text-3xl font-black text-glow-magenta tabular-nums">{result.opponentScore}</div>
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

  if (!room) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-muted-foreground text-center">{tr("duoDesc")}</p>
        <button
          onClick={() => duo.create()}
          disabled={busy}
          className="w-full rounded-xl border border-[color:var(--neon-cyan)] bg-gradient-to-r from-[color:var(--neon-cyan)]/20 to-[color:var(--neon-magenta)]/20 px-6 py-4 font-display text-base font-black uppercase tracking-[0.3em] text-glow-cyan transition hover:scale-[1.02] disabled:opacity-50"
        >
          ⚔ {tr("duoCreate")}
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
        {[
          { p: me, label: tr("duoYou"), c: "var(--neon-cyan)", glow: "text-glow-cyan" },
          { p: opponent, label: tr("duoOpponent"), c: "var(--neon-magenta)", glow: "text-glow-magenta" },
        ].map((slot, i) => (
          <div key={i} className="rounded-xl border bg-black/30 p-4 text-center" style={{ borderColor: `color-mix(in oklab, ${slot.c} 50%, transparent)` }}>
            <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{slot.label}</div>
            <div className={`mt-1 truncate font-display text-sm font-black uppercase tracking-widest ${slot.glow}`}>
              {slot.p ? (slot.p.display_name || "Player") : "—"}
            </div>
            {room.status === "finished" && <div className="mt-1 text-xs tabular-nums text-muted-foreground">{slot.p?.score ?? 0}</div>}
          </div>
        ))}
      </div>

      {!opponent && <div className="text-center text-[11px] uppercase tracking-[0.25em] text-glow-cyan animate-pulse">{tr("duoWaiting")}</div>}

      {opponent && room.status !== "playing" && (
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
