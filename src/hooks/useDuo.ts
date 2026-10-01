import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import {
  duoCreateRoom,
  duoJoinRoom,
  duoRoomState,
  duoStart,
  duoBeginRun,
  duoPushScore,
  duoGoDown,
  duoRevive,
  duoHeartbeat,
  duoEndRun,
  duoCoopResult,
  duoLeave,
  duoGuestCreateRoom,
  duoGuestJoinRoom,
  duoGuestRoomState,
  duoGuestStart,
  duoGuestBeginRun,
  duoGuestPushScore,
  duoGuestGoDown,
  duoGuestRevive,
  duoGuestEndRun,
  duoGuestCoopResult,
  duoGuestLeave,
  type DuoRoomState,
  type DuoCoopSummary,
} from "@/lib/duo.functions";

export type DuoCoopResult = DuoCoopSummary;

export function useDuo(opts: {
  userId: string | null;
  deviceId: string | null;
  displayName: string | null;
  equippedSkin: string;
}) {
  const { userId, deviceId, displayName, equippedSkin } = opts;
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
  const guestCreateFn = useServerFn(duoGuestCreateRoom);
  const guestJoinFn = useServerFn(duoGuestJoinRoom);
  const guestStateFn = useServerFn(duoGuestRoomState);
  const guestStartFn = useServerFn(duoGuestStart);
  const guestBeginFn = useServerFn(duoGuestBeginRun);
  const guestPushFn = useServerFn(duoGuestPushScore);
  const guestDownFn = useServerFn(duoGuestGoDown);
  const guestReviveFn = useServerFn(duoGuestRevive);
  const guestEndFn = useServerFn(duoGuestEndRun);
  const guestResultFn = useServerFn(duoGuestCoopResult);
  const guestLeaveFn = useServerFn(duoGuestLeave);

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
      const r = (
        userId
          ? await stateFn({ data: { room_id: id } })
          : deviceId
            ? await guestStateFn({ data: { room_id: id, device_id: deviceId } })
            : null
      ) as DuoRoomState | null;
      setRoom(r ?? null);
    } catch {
      setRoom(null);
    }
  }, [deviceId, guestStateFn, stateFn, userId]);

  // Realtime + polling fallback (keeps both allies in sync without touching the game loop)
  useEffect(() => {
    if (!room?.id) return;
    const id = room.id;
    const ch = userId
      ? supabase
          .channel(`duo-${id}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${id}` },
            () => refresh(),
          )
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "rooms", filter: `id=eq.${id}` },
            () => refresh(),
          )
          .subscribe()
      : null;
    const poll = window.setInterval(refresh, 2000);
    return () => {
      if (ch) supabase.removeChannel(ch);
      window.clearInterval(poll);
    };
  }, [room?.id, refresh, userId]);

  // Presence heartbeat — a micro network drop must never end a coop run
  useEffect(() => {
    if (!room?.id) return;
    const id = room.id;
    const beat = () => {
      if (!userId) {
        refresh();
        return;
      }
      beatFn({ data: { room_id: id } }).catch(() => {
        /* transient */
      });
    };
    beat();
    const t = window.setInterval(beat, 5000);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        beat();
        refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [room?.id, beatFn, refresh, userId]);

  const run = useCallback(async <T>(fn: () => Promise<T>) => {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message || "DUO_ERROR");
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  const create = useCallback(async () => {
    if (!userId && !deviceId) {
      setError("AUTH_REQUIRED");
      return;
    }
    const r = await run(() =>
      userId
        ? createFn({ data: { display_name: displayName, equipped_skin: equippedSkin } })
        : guestCreateFn({
            data: { device_id: deviceId!, equipped_skin: equippedSkin },
          }),
    );
    if (r) {
      setResult(null);
      setRoom(r as DuoRoomState);
    }
  }, [createFn, deviceId, displayName, equippedSkin, guestCreateFn, run, userId]);

  const join = useCallback(
    async (code: string) => {
      if (!userId && !deviceId) {
        setError("AUTH_REQUIRED");
        return;
      }
      const r = await run(() =>
        userId
          ? joinFn({ data: { code, display_name: displayName, equipped_skin: equippedSkin } })
          : guestJoinFn({ data: { code, device_id: deviceId!, equipped_skin: equippedSkin } }),
      );
      if (r) {
        setResult(null);
        setRoom(r as DuoRoomState);
      }
    },
    [deviceId, displayName, equippedSkin, guestJoinFn, joinFn, run, userId],
  );

  const startMatch = useCallback(async () => {
    const r = await run(() =>
      userId
        ? startFn({ data: { room_id: roomIdRef.current! } })
        : guestStartFn({ data: { room_id: roomIdRef.current!, device_id: deviceId! } }),
    );
    if (r) setRoom(r as DuoRoomState);
  }, [deviceId, guestStartFn, run, startFn, userId]);

  const beginRun = useCallback(() => {
    const id = roomIdRef.current;
    if (!id) return;
    (userId
      ? beginFn({ data: { room_id: id } })
      : guestBeginFn({ data: { room_id: id, device_id: deviceId! } })
    ).catch(() => {
      /* transient */
    });
  }, [beginFn, deviceId, guestBeginFn, userId]);

  const pushScore = useCallback(
    (score: number) => {
      const id = roomIdRef.current;
      if (!id) return;
      (userId
        ? pushFn({ data: { room_id: id, score: Math.max(0, Math.floor(score)) } })
        : guestPushFn({
            data: { room_id: id, device_id: deviceId!, score: Math.max(0, Math.floor(score)) },
          })
      ).catch(() => {
        /* transient */
      });
    },
    [deviceId, guestPushFn, pushFn, userId],
  );

  const goDown = useCallback(
    async (downMs = 10000) => {
      const id = roomIdRef.current;
      if (!id) return;
      try {
        setRoom(
          (userId
            ? await downFn({ data: { room_id: id, down_ms: downMs } })
            : await guestDownFn({
                data: { room_id: id, device_id: deviceId!, down_ms: downMs },
              })) as DuoRoomState,
        );
      } catch {
        /* transient */
      }
    },
    [deviceId, downFn, guestDownFn, userId],
  );

  const revivePartner = useCallback(async () => {
    const id = roomIdRef.current;
    if (!id) return false;
    try {
      const r = userId
        ? await reviveFn({ data: { room_id: id } })
        : await guestReviveFn({ data: { room_id: id, device_id: deviceId! } });
      await refresh();
      return !!r?.revived;
    } catch {
      return false;
    }
  }, [deviceId, guestReviveFn, refresh, reviveFn, userId]);

  /** Fin de vie du joueur : le serveur clôture la manche seulement quand l'équipe entière est éliminée. */
  const endRun = useCallback(
    async (score: number) => {
      const id = roomIdRef.current;
      if (!id) return;
      const safe = Math.max(0, Math.floor(score));
      try {
        setResult(
          (userId
            ? await endFn({ data: { room_id: id, score: safe } })
            : await guestEndFn({
                data: { room_id: id, device_id: deviceId!, score: safe },
              })) as DuoCoopResult,
        );
      } catch {
        /* retry below */
      }
      for (let i = 0; i < 30; i++) {
        try {
          const r = (
            userId
              ? await resultFn({ data: { room_id: id } })
              : await guestResultFn({ data: { room_id: id, device_id: deviceId! } })
          ) as DuoCoopResult;
          setResult(r);
          if (r.settled) {
            await refresh();
            return;
          }
        } catch {
          /* retry */
        }
        await new Promise((res) => setTimeout(res, 2000));
      }
    },
    [deviceId, endFn, guestEndFn, guestResultFn, refresh, resultFn, userId],
  );

  const leave = useCallback(async () => {
    const id = roomIdRef.current;
    setRoom(null);
    setResult(null);
    setError(null);
    if (id && (userId || deviceId))
      await (
        userId
          ? leaveFn({ data: { room_id: id } })
          : guestLeaveFn({ data: { room_id: id, device_id: deviceId! } })
      ).catch(() => {
        /* noop */
      });
  }, [deviceId, guestLeaveFn, leaveFn, userId]);

  const me =
    room?.players.find((p) => (userId ? p.user_id === userId : p.device_id === deviceId)) ?? null;
  const partner =
    room?.players.find((p) => (userId ? p.user_id !== userId : p.device_id !== deviceId)) ?? null;
  const isHost = !!room && (userId ? room.host_id === userId : room.host_device_id === deviceId);
  const teamScore = room ? room.players.reduce((sum, p) => sum + (p.score || 0), 0) : 0;
  const partnerDown = partner?.state === "down";
  const iAmDown = me?.state === "down";

  return {
    room,
    me,
    partner,
    isHost,
    busy,
    error,
    result,
    setResult,
    teamScore,
    partnerDown,
    iAmDown,
    create,
    join,
    startMatch,
    beginRun,
    pushScore,
    goDown,
    revivePartner,
    endRun,
    leave,
    refresh,
  };
}
