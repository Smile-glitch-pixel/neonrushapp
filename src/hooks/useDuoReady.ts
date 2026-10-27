/**
 * NEON RUSH — Bouton « Prêt » du Duo (Duo Reborn).
 *
 * Chaque joueur indique s'il est prêt via Supabase Realtime « Presence » :
 * rien n'est enregistré en base, aucune migration SQL n'est nécessaire.
 * Quand les deux joueurs sont prêts, l'hôte lance la partie automatiquement
 * (voir DuoLobby.tsx).
 *
 * SÉCURITÉ : on n'envoie JAMAIS l'identifiant d'appareil d'un invité (c'est son
 * « mot de passe »). Chaque session utilise une clé aléatoire jetable. Comme la salle
 * ne contient que deux joueurs, « l'autre clé » est forcément le coéquipier.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

function randomKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `k${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

export function useDuoReady(opts: {
  roomId: string | null;
  /** Vrai uniquement dans la salle d'attente, avec le coéquipier présent. */
  enabled: boolean;
}) {
  const { roomId, enabled } = opts;
  const [myReady, setMyReadyState] = useState(false);
  const [partnerReady, setPartnerReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const myReadyRef = useRef(false);
  const sessionKey = useRef<string>(randomKey());

  useEffect(() => {
    if (!roomId || !enabled) return;

    myReadyRef.current = false;
    setMyReadyState(false);
    setPartnerReady(false);

    const mine = sessionKey.current;
    const channel = supabase.channel(`duo-ready-${roomId}`, {
      config: { presence: { key: mine } },
    });
    channelRef.current = channel;

    const compute = () => {
      const state = channel.presenceState<{ ready?: boolean }>();
      const others = Object.entries(state).filter(
        ([key, metas]) => key !== mine && metas.some((m) => m.ready === true),
      );
      setPartnerReady(others.length > 0);
    };

    channel.on("presence", { event: "sync" }, compute).subscribe((status) => {
      if (status === "SUBSCRIBED") {
        setConnected(true);
        void channel.track({ ready: myReadyRef.current });
      } else {
        setConnected(false);
        console.info("[duo-ready] canal :", status);
      }
    });

    return () => {
      channelRef.current = null;
      setConnected(false);
      setPartnerReady(false);
      supabase.removeChannel(channel);
    };
  }, [roomId, enabled]);

  const setMyReady = useCallback((value: boolean) => {
    myReadyRef.current = value;
    setMyReadyState(value);
    void channelRef.current?.track({ ready: value });
  }, []);

  return { myReady, setMyReady, partnerReady, connected };
}