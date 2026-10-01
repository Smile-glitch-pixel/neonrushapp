import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { publicClient } from "@/lib/guest.functions";

const IdSchema = z.object({ room_id: z.string().uuid() });

export type DuoPlayerState = "alive" | "down" | "dead" | "disconnected";

export type DuoPlayer = {
  user_id: string | null;
  device_id: string | null;
  display_name: string | null;
  equipped_skin: string | null;
  /** Contribution personnelle au score d'équipe (jamais utilisée pour désigner un vainqueur). */
  score: number;
  is_host: boolean;
  finished: boolean;
  state: DuoPlayerState;
  down_until: string | null;
  revives: number;
  last_seen: string;
};

export type DuoRoomState = {
  id: string;
  code: string;
  host_id: string | null;
  host_device_id: string | null;
  status: "waiting" | "ready" | "playing" | "finished";
  duration_s: number;
  started_at: string | null;
  ends_at: string | null;
  /** Score commun de l'équipe = somme des contributions des deux alliés. */
  team_score: number;
  survived_ms: number;
  revives: number;
  players: DuoPlayer[];
};

export type DuoCoopSummary = {
  settled: boolean;
  teamScore: number;
  survivedMs: number;
  revives: number;
  myContribution: number;
  partnerContribution: number;
};

const GuestDeviceSchema = z.string().min(16).max(64);
const GuestRoomSchema = z.object({
  room_id: z.string().uuid(),
  device_id: GuestDeviceSchema,
});

async function readGuestRoom(roomId: string, deviceId: string): Promise<DuoRoomState | null> {
  const sb = await publicClient();
  const { data, error } = await sb.rpc("duo_guest_room_state", {
    _room: roomId,
    _device: deviceId,
  });
  if (error) throw error;
  return data ? (data as unknown as DuoRoomState) : null;
}

function summarizeGuestRoom(room: DuoRoomState, deviceId: string): DuoCoopSummary {
  const me = room.players.find((p) => p.device_id === deviceId);
  const partner = room.players.find((p) => p.device_id !== deviceId);
  const liveScore = room.players.reduce((sum, p) => sum + (p.score || 0), 0);
  return {
    settled: room.status === "finished",
    teamScore: Math.max(room.team_score || 0, liveScore),
    survivedMs:
      room.survived_ms || (room.started_at ? Date.now() - new Date(room.started_at).getTime() : 0),
    revives: room.revives || 0,
    myContribution: me?.score ?? 0,
    partnerContribution: partner?.score ?? 0,
  };
}

/** Crée un salon Duo avec l'identité invitée réservée à cet appareil. */
export const duoGuestCreateRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({ device_id: GuestDeviceSchema, equipped_skin: z.string().max(24).optional() })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const { data: roomId, error } = await sb.rpc("duo_guest_create_room", {
      _device: data.device_id,
      _skin: data.equipped_skin ?? "cyan",
    });
    if (error) throw error;
    const room = await readGuestRoom(roomId as string, data.device_id);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    return room;
  });

/** Rejoint un salon Duo avec un pseudo invité. */
export const duoGuestJoinRoom = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z
      .object({
        code: z.string().min(4).max(12),
        device_id: GuestDeviceSchema,
        equipped_skin: z.string().max(24).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const { data: roomId, error } = await sb.rpc("duo_guest_join_room", {
      _code: data.code.trim().toUpperCase(),
      _device: data.device_id,
      _skin: data.equipped_skin ?? "cyan",
    });
    if (error) throw error;
    const room = await readGuestRoom(roomId as string, data.device_id);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    return room;
  });

/** Salon et présence d'un joueur invité. */
export const duoGuestRoomState = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => GuestRoomSchema.parse(input))
  .handler(async ({ data }) => readGuestRoom(data.room_id, data.device_id));

/** Démarre une partie Duo depuis l'hôte invité. */
export const duoGuestStart = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GuestRoomSchema.parse(input))
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const { error } = await sb.rpc("duo_guest_start", {
      _room: data.room_id,
      _device: data.device_id,
    });
    if (error) throw error;
    return readGuestRoom(data.room_id, data.device_id);
  });

/** Réinitialise le score de la manche pour le joueur invité. */
export const duoGuestBeginRun = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GuestRoomSchema.parse(input))
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const { error } = await sb.rpc("duo_guest_begin_run", {
      _room: data.room_id,
      _device: data.device_id,
    });
    if (error) throw error;
    return { ok: true };
  });

/** Enregistre la contribution de score invitée, validée côté serveur. */
export const duoGuestPushScore = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    GuestRoomSchema.extend({ score: z.number().int().min(0).max(10_000_000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const { error } = await sb.rpc("duo_guest_push_score", {
      _room: data.room_id,
      _device: data.device_id,
      _score: data.score,
    });
    if (error) throw error;
    return { ok: true };
  });

/** Met un joueur invité à terre. */
export const duoGuestGoDown = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    GuestRoomSchema.extend({ down_ms: z.number().int().min(1000).max(30000).optional() }).parse(
      input,
    ),
  )
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const { error } = await sb.rpc("duo_guest_go_down", {
      _room: data.room_id,
      _device: data.device_id,
      _down_ms: data.down_ms ?? 10000,
    });
    if (error) throw error;
    const room = await readGuestRoom(data.room_id, data.device_id);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    return room;
  });

/** Réanime un coéquipier depuis un salon invité. */
export const duoGuestRevive = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GuestRoomSchema.parse(input))
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const { data: revived, error } = await sb.rpc("duo_guest_revive", {
      _room: data.room_id,
      _device: data.device_id,
    });
    if (error) throw error;
    return { revived: !!revived };
  });

/** Signale la fin de manche et récupère le résultat de l'équipe invitée. */
export const duoGuestEndRun = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    GuestRoomSchema.extend({ score: z.number().int().min(0).max(10_000_000) }).parse(input),
  )
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const { error } = await sb.rpc("duo_guest_end_run", {
      _room: data.room_id,
      _device: data.device_id,
      _score: data.score,
    });
    if (error) throw error;
    const room = await readGuestRoom(data.room_id, data.device_id);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    return summarizeGuestRoom(room, data.device_id);
  });

/** Résultat public d'une partie Duo, consulté par un membre invité. */
export const duoGuestCoopResult = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => GuestRoomSchema.parse(input))
  .handler(async ({ data }) => {
    const room = await readGuestRoom(data.room_id, data.device_id);
    if (!room) throw new Error("ROOM_NOT_FOUND");
    return summarizeGuestRoom(room, data.device_id);
  });

/** Quitte un salon Duo invité ou marque le joueur éliminé pendant la manche. */
export const duoGuestLeave = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => GuestRoomSchema.parse(input))
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const { error } = await sb.rpc("duo_guest_leave", {
      _room: data.room_id,
      _device: data.device_id,
    });
    if (error) throw error;
    return { ok: true };
  });

/** Crée une escouade Duo coop + code d'invitation. */
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
      _skin: data.equipped_skin ?? "cyan",
    });
    if (error) throw error;
    return await readRoom(context.supabase, roomId as unknown as string);
  });

/** Rejoint l'escouade d'un ami via son code. */
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
      _skin: data.equipped_skin ?? "cyan",
    });
    if (error) {
      const msg = error.message || "";
      for (const code of [
        "ROOM_NOT_FOUND",
        "ROOM_EXPIRED",
        "ROOM_OWN",
        "ROOM_CLOSED",
        "ROOM_FULL",
      ]) {
        if (msg.includes(code)) throw new Error(code);
      }
      throw error;
    }
    return await readRoom(context.supabase, roomId as unknown as string);
  });

/** État courant de l'escouade (secours si le temps réel décroche). */
export const duoRoomState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }): Promise<DuoRoomState | null> => {
    await context.supabase.rpc("duo_heartbeat", { _room: data.room_id });
    await context.supabase.rpc("duo_tick", { _room: data.room_id });
    // La salle peut avoir été supprimée (expirée / quittée) : pas une erreur.
    return await readRoom(context.supabase, data.room_id).catch(() => null);
  });

/** L'hôte lance la partie coopérative (chrono serveur partagé). */
export const duoStart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const room = await readRoom(context.supabase, data.room_id);
    if (room.host_id !== context.userId) throw new Error("NOT_HOST");
    if (room.players.length < 2) throw new Error("NOT_ENOUGH_PLAYERS");
    if (room.status === "playing") return room;

    const now = Date.now();
    const { error } = await context.supabase
      .from("rooms")
      .update({
        status: "playing",
        started_at: new Date(now).toISOString(),
        ends_at: new Date(now + room.duration_s * 1000).toISOString(),
        team_score: 0,
        survived_ms: 0,
        revives: 0,
      })
      .eq("id", room.id);
    if (error) throw error;

    return await readRoom(context.supabase, room.id);
  });

/** Chaque client réinitialise sa propre ligne au début de la manche. */
export const duoBeginRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("room_players")
      .update({
        score: 0,
        finished: false,
        state: "alive",
        down_until: null,
        revives: 0,
        last_seen: new Date().toISOString(),
      })
      .eq("room_id", data.room_id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

/** Contribution périodique au score d'équipe — validée par la base (monotone + plafond temporel). */
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
      .update({ score: data.score, last_seen: new Date().toISOString() })
      .eq("room_id", data.room_id)
      .eq("user_id", context.userId);
    if (error) throw error;
    await context.supabase.rpc("duo_tick", { _room: data.room_id });
    return { ok: true };
  });

/** Le joueur est touché : il tombe à terre et peut être réanimé par son allié. */
export const duoGoDown = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        room_id: z.string().uuid(),
        down_ms: z.number().int().min(1000).max(30000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.rpc("duo_go_down", {
      _room: data.room_id,
      _down_ms: data.down_ms ?? 10000,
    });
    if (error) throw error;
    await context.supabase.rpc("duo_tick", { _room: data.room_id });
    return readRoom(context.supabase, data.room_id);
  });

/** Réanimation de l'allié — validée côté serveur (allié à terre + compte à rebours actif). */
export const duoRevive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("duo_revive_any", {
      _room: data.room_id,
    });
    if (error) throw error;
    return { revived: !!ok };
  });

/** Signal de présence — sert à détecter les déconnexions sans couper pour une micro-coupure. */
export const duoHeartbeat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.rpc("duo_heartbeat", { _room: data.room_id });
    return { ok: true };
  });

/** Le joueur est définitivement éliminé pour cette manche (compte à rebours écoulé ou temps fini). */
export const duoEndRun = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({ room_id: z.string().uuid(), score: z.number().int().min(0).max(10_000_000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("room_players")
      .update({ score: data.score, last_seen: new Date().toISOString() })
      .eq("room_id", data.room_id)
      .eq("user_id", context.userId);
    await context.supabase.rpc("duo_end_run", { _room: data.room_id });
    return summarize(await readRoom(context.supabase, data.room_id), context.userId);
  });

/** Résultat coopératif de l'équipe (aucun vainqueur, aucun perdant). */
export const duoCoopResult = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    await context.supabase.rpc("duo_tick", { _room: data.room_id });
    return summarize(await readRoom(context.supabase, data.room_id), context.userId);
  });

/** Quitter l'escouade. En pleine partie, cela met fin à la manche coopérative. */
export const duoLeave = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => IdSchema.parse(input))
  .handler(async ({ data, context }) => {
    const room = await readRoom(context.supabase, data.room_id).catch(() => null);
    if (!room) return { ok: true };

    if (room.status === "playing") {
      await context.supabase.rpc("duo_end_run", { _room: room.id });
      return { ok: true, abandoned: true };
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

type SupabaseLike = Pick<SupabaseClient<Database>, "from">;

function summarize(room: DuoRoomState, userId: string): DuoCoopSummary {
  const me = room.players.find((p) => p.user_id === userId);
  const partner = room.players.find((p) => p.user_id !== userId);
  const live = room.players.reduce((sum, p) => sum + (p.score || 0), 0);
  return {
    settled: room.status === "finished",
    teamScore: Math.max(room.team_score || 0, live),
    survivedMs:
      room.survived_ms || (room.started_at ? Date.now() - new Date(room.started_at).getTime() : 0),
    revives: room.revives || 0,
    myContribution: me?.score ?? 0,
    partnerContribution: partner?.score ?? 0,
  };
}

async function readRoom(supabase: SupabaseLike, roomId: string): Promise<DuoRoomState> {
  const { data: room, error } = await supabase
    .from("rooms")
    .select(
      "id, code, host_id, host_device_id, status, duration_s, started_at, ends_at, team_score, survived_ms, revives",
    )
    .eq("id", roomId)
    .maybeSingle();
  if (error) throw error;
  if (!room) throw new Error("ROOM_NOT_FOUND");

  const { data: players, error: pErr } = await supabase
    .from("room_players")
    .select(
      "user_id, display_name, equipped_skin, score, is_host, finished, state, down_until, revives, last_seen",
    )
    .eq("room_id", roomId)
    .order("is_host", { ascending: false });
  if (pErr) throw pErr;

  const list = ((players ?? []) as Omit<DuoPlayer, "device_id">[]).map((p) => {
    const stale = Date.now() - new Date(p.last_seen).getTime() > 15000;
    return stale && (p.state === "alive" || p.state === "down")
      ? { ...p, device_id: null, state: "disconnected" as DuoPlayerState }
      : { ...p, device_id: null };
  });

  return { ...(room as DuoRoomState), players: list };
}
