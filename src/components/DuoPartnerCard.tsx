/**
 * NEON RUSH — Carte du coéquipier (Duo Reborn, étape A).
 *
 * Affiche en jeu : le skin, le nom, l'état et le score en direct du partenaire,
 * ainsi que la part de contribution de chacun au score d'équipe.
 *
 * Purement visuel : aucun appel réseau, aucun impact sur la boucle de jeu.
 * Les données viennent du hook useDuo (room.players) déjà présent.
 */
import { useEffect, useRef, useState } from "react";
import { SKINS } from "@/lib/neon-progression";
import type { DuoPlayer } from "@/lib/duo.functions";

type Props = {
  /** Le coéquipier (null tant qu'il n'a pas rejoint). */
  partner: DuoPlayer | null;
  /** Mon score local, mis à jour en direct par le moteur. */
  myScore: number;
  /** Traducteur du jeu : tr("clé"). */
  tr: (key: string) => string;
};

/** Clé de traduction + couleur de texte pour chaque état du partenaire. */
const STATE_UI: Record<string, { key: string; className: string }> = {
  alive: { key: "duoAlive", className: "text-glow-cyan" },
  down: { key: "duoDown", className: "text-glow-yellow" },
  dead: { key: "duoDead", className: "text-muted-foreground" },
  disconnected: { key: "duoDisconnected", className: "text-muted-foreground" },
};

/**
 * Fait « défiler » un nombre vers sa nouvelle valeur au lieu de le faire sauter.
 * L'animation s'arrête dès que la valeur est atteinte (pas de rendu inutile).
 */
function useSmoothNumber(target: number): number {
  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    let frame = 0;
    const step = () => {
      const diff = target - shownRef.current;
      if (Math.abs(diff) < 1) {
        shownRef.current = target;
        setShown(target);
        return;
      }
      // On avance d'environ 18 % de l'écart à chaque image (au moins 1 point).
      const move = Math.sign(diff) * Math.max(1, Math.abs(diff) * 0.18);
      shownRef.current += move;
      setShown(Math.round(shownRef.current));
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target]);

  return shown;
}

export default function DuoPartnerCard({ partner, myScore, tr }: Props) {
  const partnerScore = useSmoothNumber(partner?.score ?? 0);

  // Pas de partenaire : on garde l'ancienne ligne simple « Coéquipier : En attente ».
  if (!partner) {
    return (
      <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {tr("duoPartner")} : <span className="text-glow-magenta">{tr("duoWaiting")}</span>
      </div>
    );
  }

  const skin = SKINS.find((s) => s.id === partner.equipped_skin) ?? SKINS[0];
  const [c0, c1, c2] = skin.colors;
  const state = STATE_UI[partner.state] ?? STATE_UI.alive;

  // Part de chacun dans le score d'équipe (50/50 tant que personne n'a marqué).
  const total = Math.max(0, myScore) + Math.max(0, partner.score);
  const myShare = total > 0 ? Math.round((Math.max(0, myScore) / total) * 100) : 50;

  return (
    <div className="panel-neon mt-2 w-44 rounded-lg px-3 py-2">
      <div className="flex items-center gap-2">
        {/* Pastille aux couleurs du skin du partenaire */}
        <span
          aria-hidden
          className="inline-block h-4 w-4 shrink-0 rounded-full"
          style={{
            background: `radial-gradient(circle at 30% 30%, ${c0}, ${c1} 55%, ${c2})`,
            boxShadow: `0 0 10px ${c1}`,
            opacity: partner.state === "alive" ? 1 : 0.45,
          }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[11px] font-bold uppercase tracking-widest">
            {partner.display_name || tr("duoPartner")}
          </div>
          <div className={`text-[9px] uppercase tracking-[0.2em] ${state.className}`}>
            {tr(state.key)}
          </div>
        </div>
        <div className="text-glow-yellow text-sm font-bold tabular-nums">{partnerScore}</div>
      </div>

      {/* Barre de contribution : moi (magenta) à gauche, partenaire (couleur de son skin) à droite */}
      <div className="mt-2">
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-[#ff2e9a]" style={{ width: `${myShare}%` }} />
          <div className="h-full flex-1" style={{ background: c1 }} />
        </div>
        <div className="mt-1 flex justify-between text-[8px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>
            {tr("duoYou")} {myShare}%
          </span>
          <span>{100 - myShare}%</span>
        </div>
      </div>
    </div>
  );
}