import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  duoCreateRoom, duoJoinRoom, duoRoomState, duoStart, duoBeginRun, duoPushScore,
  duoGoDown, duoRevive, duoHeartbeat, duoEndRun, duoCoopResult, duoLeave,
  type DuoRoomState, type DuoCoopSummary,
} from "@/lib/duo.functions";

export type DuoCoopResult = DuoCoopSummary;

export function useDuo(opts: { userId: string | null; displayName: string | null; equippedSkin: string }) {
  const { userId, displayName, equippedSkin } = opts;
  const createFn = useServerFn(duoCreateRoom);
  const joinFn = useServerFn(duoJoinRoom);
  const stateFn = useServerFn(duoRoomState);
  const startFn = useServerFn(duoStart);
  const beginFn = useServerFn(duoBeginRun);
  const pushFn = useServerFn(duoPushScore);
  const downFn = useServerFn(duoGoDown);
  const reviveFn = useServerFn(duoRevive);
  const beatFn = useServerFn(duoHeartbeat);
  const endFn = useServerFn(duoEndRun);
  const resultFn = useServerFn(duoCoopResult);
  const leaveFn = useServerFn(duoLeave);

  const [room, setRoom] = useState<DuoRoomState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DuoCoopResult | null>(null);
  const roomIdRef = useRef<string | null>(null);
  roomIdRef.current = room?.id ?? null;

  const refresh = useCallback(async () => {
    const id = roomIdRef.current;
    if (!id) return;
    try {
      const r = (await stateFn({ data: { room_id: id } })) as DuoRoomState;
      setRoom(r);
    } catch {
      setRoom(null);
    }
  }, [stateFn]);

  // Realtime + polling fallback (keeps both allies in sync without touching the game loop)
  useEffect(() => {
    if (!room?.id) return;
    const id = room.id;
    const ch = supabase
      .channel(`duo-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${id}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${id}` }, () => refresh())
      .subscribe();
    const poll = window.setInterval(refresh, 2000);
    return () => { supabase.removeChannel(ch); window.clearInterval(poll); };
  }, [room?.id, refresh]);

  // Presence heartbeat — a micro network drop must never end a coop run
  useEffect(() => {
    if (!room?.id) return;
    const id = room.id;
    const beat = () => { beatFn({ data: { room_id: id } }).catch(() => { /* transient */ }); };
    beat();
    const t = window.setInterval(beat, 5000);
    const onVisible = () => { if (document.visibilityState === "visible") { beat(); refresh(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(t); document.removeEventListener("visibilitychange", onVisible); };
  }, [room?.id, beatFn, refresh]);

  const run = useCallback(async <T,>(fn: () => Promise<T>) => {
    setBusy(true); setError(null);
    try { return await fn(); }
    catch (e) { setError((e as Error).message || "DUO_ERROR"); return null; }
    finally { setBusy(false); }
  }, []);

  const create = useCallback(async () => {
    if (!userId) { setError("AUTH_REQUIRED"); return; }
    const r = await run(() => createFn({ data: { display_name: displayName, equipped_skin: equippedSkin } }));
    if (r) { setResult(null); setRoom(r as DuoRoomState); }
  }, [createFn, displayName, equippedSkin, run, userId]);

  const join = useCallback(async (code: string) => {
    if (!userId) { setError("AUTH_REQUIRED"); return; }
    const r = await run(() => joinFn({ data: { code, display_name: displayName, equipped_skin: equippedSkin } }));
    if (r) { setResult(null); setRoom(r as DuoRoomState); }
  }, [joinFn, displayName, equippedSkin, run, userId]);

  const startMatch = useCallback(async () => {
    const r = await run(() => startFn({ data: { room_id: roomIdRef.current! } }));
    if (r) setRoom(r as DuoRoomState);
  }, [run, startFn]);

  const beginRun = useCallback(() => {
    const id = roomIdRef.current;
    if (!id) return;
    beginFn({ data: { room_id: id } }).catch(() => { /* transient */ });
  }, [beginFn]);

  const pushScore = useCallback((score: number) => {
    const id = roomIdRef.current;
    if (!id) return;
    pushFn({ data: { room_id: id, score: Math.max(0, Math.floor(score)) } }).catch(() => { /* transient */ });
  }, [pushFn]);

  const goDown = useCallback(async (downMs = 10000) => {
    const id = roomIdRef.current;
    if (!id) return;
    try { setRoom((await downFn({ data: { room_id: id, down_ms: downMs } })) as DuoRoomState); }
    catch { /* transient */ }
  }, [downFn]);

  const revivePartner = useCallback(async (targetId: string) => {
    const id = roomIdRef.current;
    if (!id) return false;
    try {
      const r = await reviveFn({ data: { room_id: id, target_id: targetId } });
      await refresh();
      return !!r?.revived;
    } catch { return false; }
  }, [reviveFn, refresh]);

  /** Fin de vie du joueur : le serveur clôture la manche seulement quand l'équipe entière est éliminée. */
  const endRun = useCallback(async (score: number) => {
    const id = roomIdRef.current;
    if (!id) return;
    const safe = Math.max(0, Math.floor(score));
    try { setResult((await endFn({ data: { room_id: id, score: safe } })) as DuoCoopResult); } catch { /* retry below */ }
    for (let i = 0; i < 30; i++) {
      try {
        const r = (await resultFn({ data: { room_id: id } })) as DuoCoopResult;
        setResult(r);
        if (r.settled) { await refresh(); return; }
      } catch { /* retry */ }
      await new Promise((res) => setTimeout(res, 2000));
    }
  }, [endFn, resultFn, refresh]);

  const leave = useCallback(async () => {
    const id = roomIdRef.current;
    setRoom(null); setResult(null); setError(null);
    if (id) await leaveFn({ data: { room_id: id } }).catch(() => { /* noop */ });
  }, [leaveFn]);

  const me = room?.players.find((p) => p.user_id === userId) ?? null;
  const partner = room?.players.find((p) => p.user_id !== userId) ?? null;
  const isHost = !!room && room.host_id === userId;
  const teamScore = room ? room.players.reduce((sum, p) => sum + (p.score || 0), 0) : 0;
  const partnerDown = partner?.state === "down";
  const iAmDown = me?.state === "down";

  return {
    room, me, partner, isHost, busy, error, result, setResult,
    teamScore, partnerDown, iAmDown,
    create, join, startMatch, beginRun, pushScore, goDown, revivePartner, endRun, leave, refresh,
  };
}
