import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  duoCreateRoom, duoJoinRoom, duoRoomState, duoStart, duoPushScore, duoFinish, duoLeave,
  type DuoRoomState,
} from "@/lib/duo.functions";

export type DuoResult = { result: "win" | "loss" | "draw"; myScore: number; opponentScore: number };

export function useDuo(opts: { userId: string | null; displayName: string | null; equippedSkin: string }) {
  const { userId, displayName, equippedSkin } = opts;
  const createFn = useServerFn(duoCreateRoom);
  const joinFn = useServerFn(duoJoinRoom);
  const stateFn = useServerFn(duoRoomState);
  const startFn = useServerFn(duoStart);
  const pushFn = useServerFn(duoPushScore);
  const finishFn = useServerFn(duoFinish);
  const leaveFn = useServerFn(duoLeave);

  const [room, setRoom] = useState<DuoRoomState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DuoResult | null>(null);
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

  // Realtime + polling fallback (keeps both clients in sync without touching the game loop)
  useEffect(() => {
    if (!room?.id) return;
    const id = room.id;
    const ch = supabase
      .channel(`duo-${id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${id}` }, () => refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${id}` }, () => refresh())
      .subscribe();
    const poll = window.setInterval(refresh, 3000);
    return () => { supabase.removeChannel(ch); window.clearInterval(poll); };
  }, [room?.id, refresh]);

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

  const pushScore = useCallback((score: number) => {
    const id = roomIdRef.current;
    if (!id) return;
    pushFn({ data: { room_id: id, score: Math.max(0, Math.floor(score)) } }).catch(() => { /* transient */ });
  }, [pushFn]);

  const finish = useCallback(async (score: number) => {
    const id = roomIdRef.current;
    if (!id) return;
    const safe = Math.max(0, Math.floor(score));
    for (let i = 0; i < 25; i++) {
      try {
        const r = await finishFn({ data: { room_id: id, score: safe } });
        if (r && r.settled) {
          setResult({ result: r.result, myScore: r.myScore, opponentScore: r.opponentScore });
          await refresh();
          return;
        }
      } catch { /* retry */ }
      await new Promise((res) => setTimeout(res, 2000));
    }
  }, [finishFn, refresh]);

  const leave = useCallback(async () => {
    const id = roomIdRef.current;
    setRoom(null); setResult(null); setError(null);
    if (id) await leaveFn({ data: { room_id: id } }).catch(() => { /* noop */ });
  }, [leaveFn]);

  const me = room?.players.find((p) => p.user_id === userId) ?? null;
  const opponent = room?.players.find((p) => p.user_id !== userId) ?? null;
  const isHost = !!room && room.host_id === userId;

  return { room, me, opponent, isHost, busy, error, result, setResult, create, join, startMatch, pushScore, finish, leave, refresh };
}
