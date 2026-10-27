import { useEffect, useRef, useState } from "react";
import type { useDuo } from "@/hooks/useDuo";
import type { DuoPlayer } from "@/lib/duo.functions";
import { duoMsUntilGo } from "@/lib/duo-timing";
import { useDuoReady } from "@/hooks/useDuoReady";

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

function Slot({
  p,
  label,
  color,
  glow,
  tr,
  ready = null,
}: {
  p: DuoPlayer | null;
  label: string;
  color: string;
  glow: string;
  tr: (k: string) => string;
  /** true / false = badge « Prêt » affiché ; null = on affiche l'état du joueur. */
  ready?: boolean | null;
}) {
  return (
    <div
      className="rounded-xl border bg-black/30 p-4 text-center"
      style={{ borderColor: `color-mix(in oklab, ${color} 50%, transparent)` }}
    >
      <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{label}</div>
      <div
        className={`mt-1 truncate font-display text-sm font-black uppercase tracking-widest ${glow}`}
      >
        {p ? p.display_name || "Player" : "—"}
      </div>
      {p && ready !== null && (
        <div
          className={`mt-1 text-[10px] font-bold uppercase tracking-[0.2em] ${
            ready ? "text-glow-yellow" : "text-muted-foreground"
          }`}
        >
          {ready ? tr("duoSlotReady") : tr("duoSlotNotReady")}
        </div>
      )}
      {p && ready === null && (
        <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {tr(STATE_KEY[p.state] ?? "duoAlive")}
        </div>
      )}
    </div>
  );
}

/**
 * Écran de départ commun : identique pour les deux joueurs.
 * Mêmes cases dans le même ordre (hôte à gauche) et même compte à rebours,
 * calé sur l'heure de départ du serveur.
 */
function LeadIn({
  startedAt,
  players,
  tr,
}: {
  startedAt: string | null;
  players: DuoPlayer[];
  tr: (k: string) => string;
}) {
  const [ms, setMs] = useState(() => duoMsUntilGo(startedAt));
  useEffect(() => {
    const id = window.setInterval(() => setMs(duoMsUntilGo(startedAt)), 100);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const ordered = [...players].sort((a, b) => Number(b.is_host) - Number(a.is_host));
  const n = Math.ceil(ms / 1000);

  return (
    <div className="space-y-4 text-center animate-scale-in">
      <div className="font-display text-xl font-black uppercase tracking-[0.2em] text-glow-cyan">
        🤝 {tr("duoStarting")}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Slot
          p={ordered[0] ?? null}
          label="P1"
          color="var(--neon-cyan)"
          glow="text-glow-cyan"
          tr={tr}
        />
        <Slot
          p={ordered[1] ?? null}
          label="P2"
          color="var(--neon-magenta)"
          glow="text-glow-magenta"
          tr={tr}
        />
      </div>
      <div className="font-display text-7xl font-black text-glow-yellow tabular-nums">
        {n > 0 ? n : "GO!"}
      </div>
    </div>
  );
}

/**
 * Copie un texte dans le presse-papiers.
 * navigator.clipboard n'existe pas sur une page « http » hors localhost (ex. 10.x.x.x:8080
 * en test sur le réseau) : on utilise alors l'ancienne méthode, qui marche partout.
 */
function copyText(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      void navigator.clipboard.writeText(text);
      return;
    }
  } catch {
    /* on tente la méthode de secours */
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  try {
    document.execCommand("copy");
  } catch {
    /* rien de plus à faire */
  }
  document.body.removeChild(area);
}

export default function DuoLobby({
  duo,
  tr,
  code,
  setCode,
  onCopy,
  onClose,
  teamRecord,
}: {
  duo: Duo;
  tr: (k: string) => string;
  code: string;
  setCode: (v: string) => void;
  onCopy: (code: string) => void;
  onClose: () => void;
  teamRecord: number;
}) {
  const { room, me, partner, isHost, busy, error, result } = duo;

  /* ---------- Bouton « Prêt » : l'hôte lance dès que les deux joueurs sont prêts ---------- */
  const waitingRoom = !!room && room.status !== "playing" && !!partner && !result;
  const ready = useDuoReady({ roomId: room?.id ?? null, enabled: waitingRoom });
  const partnerReady = ready.partnerReady;

  const autoStartedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!waitingRoom || !isHost || !room) return;
    if (!ready.myReady || !partnerReady || busy) return;
    if (autoStartedRef.current === room.id) return;
    autoStartedRef.current = room.id;
    void duo.startMatch();
  }, [waitingRoom, isHost, room, ready.myReady, partnerReady, busy, duo]);

  // Secours : si la connexion « Prêt » ne s'établit pas, l'hôte garde un bouton pour lancer.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!waitingRoom || ready.connected) {
      setSlow(false);
      return;
    }
    const id = window.setTimeout(() => setSlow(true), 6000);
    return () => window.clearTimeout(id);
  }, [waitingRoom, ready.connected]);
  const showForceStart = isHost && (slow || !!error);

  /* Écran d'attente identique pour les deux joueurs. Il y a TOUJOURS un bouton de sortie. */
  const waitingScreen = (teamScore: number) => (
    <div className="space-y-4 text-center animate-scale-in">
      <div className="font-display text-2xl font-black uppercase tracking-[0.2em] text-glow-cyan">
        🤝 {tr("duoEnd")}
      </div>
      <div className="text-[11px] uppercase tracking-[0.25em] text-glow-yellow animate-pulse">
        {tr("duoWaitResult")}
      </div>
      <div className="rounded-2xl border border-[color:var(--neon-cyan)]/60 bg-black/40 p-5">
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {tr("duoTeamScore")}
        </div>
        <div className="font-display text-5xl font-black text-glow-cyan tabular-nums">
          {teamScore}
        </div>
      </div>
      <button
        onClick={() => {
          duo.setResult(null);
          duo.leave();
          onClose();
        }}
        className="w-full panel-neon rounded-xl py-3 text-xs font-bold uppercase tracking-[0.25em] text-glow-magenta"
      >
        {tr("back")}
      </button>
    </div>
  );

  /* ---------- Manche lancée, pas encore de résultat ---------- */
  if (room && room.status === "playing" && !result) {
    // Pendant les 3 premières secondes : compte à rebours commun, identique pour les deux.
    if (duoMsUntilGo(room.started_at) > 0) {
      return <LeadIn startedAt={room.started_at} players={room.players} tr={tr} />;
    }
    // Ensuite, si ce joueur est sur cet écran, c'est qu'il n'est plus en jeu : attente + sortie.
    return waitingScreen(duo.teamScore);
  }

  /* ---------- Résultat coopératif : aucun vainqueur, aucun perdant ---------- */
  if (result) {
    const leaveButtons = (
      <div className="flex gap-2">
        <button
          onClick={() => {
            duo.setResult(null);
            duo.leave();
          }}
          className="flex-1 panel-neon rounded-xl py-3 text-xs font-bold uppercase tracking-[0.25em] text-glow-yellow"
        >
          {tr("duoRematch")}
        </button>
        <button
          onClick={() => {
            duo.setResult(null);
            duo.leave();
            onClose();
          }}
          className="flex-1 panel-neon rounded-xl py-3 text-xs font-bold uppercase tracking-[0.25em] text-glow-magenta"
        >
          {tr("back")}
        </button>
      </div>
    );

    /* Un seul des deux est éliminé : même écran d'attente pour les deux, sans le bilan final. */
    if (!result.settled) {
      return waitingScreen(result.teamScore);
    }

    const isRecord = result.teamScore > 0 && result.teamScore >= teamRecord;
    /* Même contenu et même ordre pour les deux joueurs : l'hôte à gauche, l'invité à droite. */
    const contributions = [
      { p: me, v: result.myContribution },
      { p: partner, v: result.partnerContribution },
    ].sort((x, y) => Number(!!y.p?.is_host) - Number(!!x.p?.is_host));

    return (
      <div className="space-y-4 text-center animate-scale-in">
        <div className="font-display text-2xl font-black uppercase tracking-[0.2em] text-glow-cyan">
          🤝 {tr("duoEnd")}
        </div>
        {isRecord && (
          <div className="pulse-glow rounded-xl border border-[color:var(--neon-yellow)]/70 bg-[color:var(--neon-yellow)]/10 py-2 font-display text-sm font-black uppercase tracking-[0.25em] text-glow-yellow">
            ★ {tr("duoRecord")}
          </div>
        )}

        <div className="rounded-2xl border border-[color:var(--neon-cyan)]/60 bg-black/40 p-5">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {tr("duoTeamScore")}
          </div>
          <div className="font-display text-5xl font-black text-glow-cyan tabular-nums">
            {result.teamScore}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[10px] uppercase tracking-[0.2em]">
          <div className="rounded-xl border border-border/50 bg-black/30 p-3">
            <div className="text-muted-foreground">{tr("duoSurvived")}</div>
            <div className="mt-1 font-display text-lg font-black text-glow-yellow tabular-nums">
              {fmtTime(result.survivedMs)}
            </div>
          </div>
          <div className="rounded-xl border border-border/50 bg-black/30 p-3">
            <div className="text-muted-foreground">{tr("duoRevives")}</div>
            <div className="mt-1 font-display text-lg font-black text-glow-magenta tabular-nums">
              {result.revives}
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-border/50 bg-black/30 p-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {tr("duoContributions")}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {contributions.map((c, i) => (
              <div key={i}>
                <div className="truncate text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {c.p?.display_name || "Player"}
                </div>
                <div
                  className={`font-display text-lg font-black tabular-nums ${
                    i === 0 ? "text-glow-cyan" : "text-glow-magenta"
                  }`}
                >
                  {c.v}
                </div>
              </div>
            ))}
          </div>
        </div>

        {leaveButtons}
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
        {error && (
          <div className="text-center text-[11px] uppercase tracking-[0.2em] text-glow-magenta">
            {tr(ERR_KEY[error] ?? "duoNotFound")}
          </div>
        )}
      </div>
    );
  }

  /* ---------- Salle d'attente de l'escouade ---------- */
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[color:var(--neon-yellow)]/50 bg-black/30 p-4 text-center">
        <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {tr("duoCode")}
        </div>
        <div className="font-display text-4xl font-black tracking-[0.35em] text-glow-yellow">
          {room.code}
        </div>
        <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {tr("duoCodeHint")}
        </div>
        <button
          onClick={() => {
            copyText(room.code);
            onCopy(room.code);
          }}
          className="panel-neon mt-3 rounded-lg px-4 py-2 text-[10px] font-bold uppercase tracking-[0.25em] text-glow-cyan"
        >
          ⧉ {tr("duoCopy")}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Slot
          p={me}
          label={tr("duoYou")}
          color="var(--neon-cyan)"
          glow="text-glow-cyan"
          tr={tr}
          ready={waitingRoom ? ready.myReady : null}
        />
        <Slot
          p={partner}
          label={tr("duoPartner")}
          color="var(--neon-magenta)"
          glow="text-glow-magenta"
          tr={tr}
          ready={waitingRoom ? partnerReady : null}
        />
      </div>

      {!partner && (
        <div className="text-center text-[11px] uppercase tracking-[0.25em] text-glow-cyan animate-pulse">
          {tr("duoWaiting")}
        </div>
      )}

      {partner && room.status !== "playing" && (
        <>
          <div className="text-center text-[11px] uppercase tracking-[0.25em] text-glow-yellow">
            {tr("duoReady")}
          </div>
          <button
            onClick={() => ready.setMyReady(!ready.myReady)}
            className={`w-full rounded-xl border px-6 py-4 font-display text-base font-black uppercase tracking-[0.3em] transition hover:scale-[1.02] ${
              ready.myReady
                ? "border-[color:var(--neon-yellow)] bg-[color:var(--neon-yellow)]/15 text-glow-yellow"
                : "border-[color:var(--neon-cyan)] bg-gradient-to-r from-[color:var(--neon-cyan)]/25 to-[color:var(--neon-magenta)]/25 text-glow-cyan"
            }`}
          >
            {ready.myReady ? tr("duoReadyOn") : tr("duoImReady")}
          </button>
          <div className="text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {tr("duoReadyHint")}
          </div>
          {showForceStart && (
            <button
              onClick={() => duo.startMatch()}
              disabled={busy}
              className="w-full panel-neon rounded-xl py-3 text-[11px] font-bold uppercase tracking-[0.25em] text-glow-cyan disabled:opacity-50"
            >
              ▶ {tr("duoStart")}
            </button>
          )}
        </>
      )}

      <button
        onClick={() => {
          duo.leave();
          onClose();
        }}
        className="w-full panel-neon rounded-xl py-3 text-[11px] font-bold uppercase tracking-[0.25em] text-glow-magenta"
      >
        ✕ {tr("duoLeave")}
      </button>
      {error && (
        <div className="text-center text-[11px] uppercase tracking-[0.2em] text-glow-magenta">
          {tr(ERR_KEY[error] ?? "duoNotFound")}
        </div>
      )}
    </div>
  );
}