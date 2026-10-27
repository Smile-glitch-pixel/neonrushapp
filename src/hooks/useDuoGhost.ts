/**
 * NEON RUSH — Boule du coéquipier (Duo Reborn, étape B).
 *
 * Envoie la position de TA boule et reçoit celle de ton coéquipier via un canal
 * Supabase Realtime « broadcast » : les messages ne passent par aucune table et
 * ne sont pas enregistrés. Marche pour les comptes connectés ET les invités.
 *
 * Les positions sont envoyées en proportion de l'écran (0 à 1), car chaque joueur
 * a une taille d'écran différente. Tout est stocké dans un ref : aucun rendu React,
 * aucun impact sur la boucle de jeu. Le dessin se fait dans le canvas.
 */
import { useEffect, useRef } from "react";
import type { MutableRefObject } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Fréquence de vérification de ta position (ms) : au plus 4 messages/s par joueur.
 * On économise le quota de messages temps réel de Supabase (2 M/mois en offre gratuite).
 */
const SEND_EVERY_MS = 250;
/** Un message est envoyé seulement si la boule a bougé d'au moins ce seuil (0 à 1). */
const MIN_MOVE = 0.004;
/** Message « je suis toujours là » si la boule ne bouge pas (ms). Doit rester < HIDE_AFTER_MS. */
const HEARTBEAT_MS = 1000;
/** Si plus aucune position n'arrive pendant ce délai, la boule disparaît. */
const HIDE_AFTER_MS = 2000;

export type DuoGhost = {
  /** Position affichée, lissée (0 à 1). */
  x: number;
  y: number;
  /** Dernière position reçue (0 à 1). */
  tx: number;
  ty: number;
  /** Des positions arrivent-elles en ce moment ? */
  visible: boolean;
  /** Le coéquipier est éliminé ou déconnecté : on ne dessine rien. */
  hidden: boolean;
  /** Le coéquipier est à terre : boule pâle. */
  down: boolean;
  name: string;
  colors: [string, string, string];
  seenAt: number;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function useDuoGhost(opts: {
  roomId: string | null;
  /** Vrai uniquement pendant la manche. */
  enabled: boolean;
  /** Ignoré : on n'envoie jamais d'identifiant de compte ou d'appareil (voir sessionKey). */
  selfKey?: string | null;
  /** Position actuelle de ma boule, en proportion de l'écran. */
  getMine: () => { x: number; y: number } | null;
}): MutableRefObject<DuoGhost> {
  const ghostRef = useRef<DuoGhost>({
    x: 0.5,
    y: 0.5,
    tx: 0.5,
    ty: 0.5,
    visible: false,
    hidden: false,
    down: false,
    name: "",
    colors: ["#ffffff", "#ff2e9a", "#6a1b9a"],
    seenAt: 0,
  });
  const getMineRef = useRef(opts.getMine);
  getMineRef.current = opts.getMine;

  const { roomId, enabled } = opts;
  // Clé aléatoire jetable : sert uniquement à ignorer mes propres messages.
  const sessionKey = useRef<string>(
    (() => {
      try {
        return crypto.randomUUID();
      } catch {
        return `k${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      }
    })(),
  );

  useEffect(() => {
    const ghost = ghostRef.current;
    if (!roomId || !enabled) {
      ghost.visible = false;
      return;
    }
    const selfKey = sessionKey.current;

    const channel = supabase.channel(`duo-pos-${roomId}`, {
      config: { broadcast: { self: false } },
    });
    let ready = false;
    let gotFirst = false;
    console.info("[duo-ghost] démarrage", { roomId });

    channel
      .on("broadcast", { event: "pos" }, ({ payload }) => {
        if (!payload || payload.from === selfKey) return;
        const x = Number(payload.x);
        const y = Number(payload.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        ghost.tx = clamp01(x);
        ghost.ty = clamp01(y);
        if (!ghost.visible) {
          ghost.x = ghost.tx;
          ghost.y = ghost.ty;
        }
        ghost.visible = true;
        ghost.seenAt = performance.now();
        if (!gotFirst) {
          gotFirst = true;
          console.info("[duo-ghost] 1er message reçu du coéquipier");
        }
      })
      .subscribe((status) => {
        ready = status === "SUBSCRIBED";
        console.info("[duo-ghost] canal :", status);
      });

    let sendWarned = false;
    let lastX = -1;
    let lastY = -1;
    let lastSentAt = 0;
    const sendId = window.setInterval(() => {
      if (!ready) return;
      const mine = getMineRef.current();
      if (!mine) return;
      const now = performance.now();
      const moved = Math.abs(mine.x - lastX) > MIN_MOVE || Math.abs(mine.y - lastY) > MIN_MOVE;
      if (!moved && now - lastSentAt < HEARTBEAT_MS) return;
      lastX = mine.x;
      lastY = mine.y;
      lastSentAt = now;
      void channel
        .send({
          type: "broadcast",
          event: "pos",
          payload: {
            from: selfKey,
            x: Math.round(mine.x * 1000) / 1000,
            y: Math.round(mine.y * 1000) / 1000,
          },
        })
        .then((res) => {
          if (res !== "ok" && !sendWarned) {
            sendWarned = true;
            console.warn("[duo-ghost] envoi refusé :", res);
          }
        });
    }, SEND_EVERY_MS);

    const hideId = window.setInterval(() => {
      if (ghost.visible && performance.now() - ghost.seenAt > HIDE_AFTER_MS) {
        ghost.visible = false;
      }
    }, 500);

    return () => {
      window.clearInterval(sendId);
      window.clearInterval(hideId);
      ghost.visible = false;
      supabase.removeChannel(channel);
    };
  }, [roomId, enabled]);

  return ghostRef;
}