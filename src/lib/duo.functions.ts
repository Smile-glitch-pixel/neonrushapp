import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const IdSchema = z.object({ room_id: z.string().uuid() });

export type DuoPlayer = {
  user_id: string;
  display_name: string | null;
  equipped_skin: string | null;
  score: number;
  is_host: boolean;
  finished: boolean;
};

export type DuoRoomState = {
  id: string;
  code: string;
  host_id: string;
  status: "waiting" | "ready" | "playing" | "finished";
  duration_s: number;
  started_at: string | null;
  ends_at: string | null;
  players: DuoPlayer[];
};

/** Crée un salon Duo + code d'invitation. */
export const duoCreateRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        display_name: z.string().max(40).nullable().optional(),
        equipped_skin: z.string().max(24).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: roomId, error } = await context.supabase.rpc("duo_create_room", {
      _name: data.display_name ?? "Player",
      _skin: data.equipped_skin ?? null,
    });
    if (error) throw error;
    return await readRoom(context.supabase, roomId as unknown as string);
  });

/** Rejoint un salon via son code. */
export const duoJoinRoom = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().min(4).max(12),
        display_name: z.string().max(40).nullable().optional(),
        equipped_skin: z.string().max(24).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: roomId, error } = await context.supabase.rpc("duo_join_room", {
      _code: data.code.trim().toUpperCase(),
      _name: data.display_name ?? "Player",
      _skin: data.equipped_skin ?? null,
    });
    if (error) {
      const msg = error.message || "";
      if (msg.includes("ROOM_NOT_FOUND")) throw new Error("ROOM_NOT_FOUND");
      if (msg.includes("ROOM_EXPIRED")) throw new Error("ROOM_EXPIRED");
      if (msg.includes("ROOM_OWN")) throw new Error("ROOM_OWN");
      if (msg.includes("ROOM_CLOSED")) throw new Error("ROOM_CLOSED");
      if (msg.includes("ROOM_FULL")) throw new Error("ROOM_FULL");
      throw error;
    }
    return await readRoom(context.supabase, roomId as unknown as string);
  });

/** État courant d'un salon (secours si le temps réel décroche). */
export const duoRoomState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => readRoom(context.supabase, data.room_id));

/** L'hôte lance le duel (chrono serveur). */
export const duoStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const room = await readRoom(context.supabase, data.room_id);
    if (room.host_id !== context.userId) throw new Error("NOT_HOST");
    if (room.players.length < 2) throw new Error("NOT_ENOUGH_PLAYERS");
    if (room.status === "playing") return room;
    if (room.status === "finished") throw new Error("ROOM_CLOSED");

    const now = Date.now();
    const { error } = await context.supabase
      .from("rooms")
      .update({
        status: "playing",
        started_at: new Date(now).toISOString(),
        ends_at: new Date(now + room.duration_s * 1000).toISOString(),
      })
      .eq("id", room.id);
    if (error) throw error;

    // reset des scores de la manche
    await context.supabase
      .from("room_players")
      .update({ score: 0, finished: false })
      .eq("room_id", room.id)
      .eq("user_id", context.userId);

    return await readRoom(context.supabase, room.id);
  });

/** Envoi périodique du score — validé par la base (monotone + plafond temporel). */
export const duoPushScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        room_id: z.string().uuid(),
        score: z.number().int().min(0).max(10_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("room_players")
      .update({ score: data.score })
      .eq("room_id", data.room_id)
      .eq("user_id", context.userId);
    if (error) throw error;
    return { ok: true };
  });

/** Fin de manche : le serveur décide du vainqueur. */
export const duoFinish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        room_id: z.string().uuid(),
        score: z.number().int().min(0).max(10_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("room_players")
      .update({ score: data.score, finished: true })
      .eq("room_id", data.room_id)
      .eq("user_id", context.userId);

    const room = await readRoom(context.supabase, data.room_id);
    const host = room.players.find((p) => p.is_host);
    const guest = room.players.find((p) => !p.is_host);
    const hostScore = host?.score ?? 0;
    const guestScore = guest?.score ?? 0;

    const timeUp = room.ends_at ? Date.now() >= new Date(room.ends_at).getTime() - 1500 : false;
    const bothDone = room.players.length >= 2 && room.players.every((p) => p.finished);
    const settled = room.status === "finished" || timeUp || bothDone;

    if (!settled) {
      return {
        settled: false as const,
        result: "pending" as const,
        hostScore,
        guestScore,
        myScore: room.players.find((p) => p.user_id === context.userId)?.score ?? 0,
        opponentScore: room.players.find((p) => p.user_id !== context.userId)?.score ?? 0,
      };
    }

    const winnerId =
      hostScore === guestScore ? null : hostScore > guestScore ? (host?.user_id ?? null) : (guest?.user_id ?? null);

    if (room.status !== "finished") {
      await context.supabase.from("rooms").update({ status: "finished" }).eq("id", room.id);
      await context.supabase.from("duo_matches").insert({
        room_id: room.id,
        host_id: host?.user_id ?? room.host_id,
        guest_id: guest?.user_id ?? null,
        host_score: hostScore,
        guest_score: guestScore,
        winner_id: winnerId,
      });
    }

    const iAmHost = room.host_id === context.userId;
    const myScore = iAmHost ? hostScore : guestScore;
    const opponentScore = iAmHost ? guestScore : hostScore;

    return {
      settled: true as const,
      result: (winnerId === null ? "draw" : winnerId === context.userId ? "win" : "loss") as
        | "win"
        | "loss"
        | "draw",
      hostScore,
      guestScore,
      myScore,
      opponentScore,
    };
  });

/** Quitter / abandonner. L'adversaire gagne si le duel était en cours. */
export const duoLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const room = await readRoom(context.supabase, data.room_id).catch(() => null);
    if (!room) return { ok: true };

    if (room.status === "playing") {
      const opponent = room.players.find((p) => p.user_id !== context.userId);
      await context.supabase.from("rooms").update({ status: "finished" }).eq("id", room.id);
      const host = room.players.find((p) => p.is_host);
      const guest = room.players.find((p) => !p.is_host);
      await context.supabase.from("duo_matches").insert({
        room_id: room.id,
        host_id: host?.user_id ?? room.host_id,
        guest_id: guest?.user_id ?? null,
        host_score: host?.score ?? 0,
        guest_score: guest?.score ?? 0,
        winner_id: opponent?.user_id ?? null,
      });
      return { ok: true, forfeited: true };
    }

    await context.supabase
      .from("room_players")
      .delete()
      .eq("room_id", room.id)
      .eq("user_id", context.userId);

    if (room.host_id === context.userId) {
      await context.supabase.from("rooms").delete().eq("id", room.id);
    } else {
      await context.supabase.from("rooms").update({ status: "waiting" }).eq("id", room.id);
    }
    return { ok: true };
  });

type SupabaseLike = { from: (table: string) => any };

async function readRoom(supabase: SupabaseLike, roomId: string): Promise<DuoRoomState> {
  const { data: room, error } = await supabase
    .from("rooms")
    .select("id, code, host_id, status, duration_s, started_at, ends_at")
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!room) throw new Error("ROOM_NOT_FOUND");

  const { data: players, error: pErr } = await supabase
    .from("room_players")
    .select("user_id, display_name, equipped_skin, score, is_host, finished")
    .eq("room_id", roomId)
    .order("is_host", { ascending: false });
  if (pErr) throw pErr;

  return { ...(room as DuoRoomState), players: (players ?? []) as DuoPlayer[] };
}
