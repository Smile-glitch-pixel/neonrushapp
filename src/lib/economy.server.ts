// Helpers serveur pour l'économie. Jamais importé par le client.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { SKINS, type SkinId } from "./neon-progression";
import { levelFromXp, type AchievementsData, type Inventory, type Stats } from "./economy";

type DB = SupabaseClient<Database>;

export type EconomyState = {
  coins: number;
  gems: number;
  xp: number;
  level: number;
  owned: SkinId[];
  equipped: SkinId;
  claimed: number[];
  pass_claimed: number[];
  inventory: Inventory;
  achievements: AchievementsData;
  stats: Stats;
  purchases: string[];
};

const VALID = new Set(SKINS.map((s) => s.id as string));

export async function loadEconomy(supabase: DB, userId: string): Promise<EconomyState> {
  const { data, error } = await supabase
    .from("player_state")
    .select("coins, gems, xp, level, owned, equipped, claimed, pass_claimed, inventory, achievements, stats, purchases")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  const row = data ?? null;
  const owned = ((row?.owned as string[] | null) ?? ["cyan"]).filter((id) => VALID.has(id)) as SkinId[];
  if (!owned.includes("cyan")) owned.push("cyan");
  const equipped = (row?.equipped && VALID.has(row.equipped) ? row.equipped : "cyan") as SkinId;
  const xp = Number(row?.xp ?? 0);
  return {
    coins: Number(row?.coins ?? 0),
    gems: Number(row?.gems ?? 0),
    xp,
    level: levelFromXp(xp),
    owned,
    equipped,
    claimed: ((row?.claimed as number[] | null) ?? []),
    pass_claimed: ((row?.pass_claimed as number[] | null) ?? []),
    inventory: ((row?.inventory as Inventory | null) ?? {}),
    achievements: ((row?.achievements as AchievementsData | null) ?? {}),
    stats: ((row?.stats as Stats | null) ?? {}),
    purchases: ((row?.purchases as string[] | null) ?? []),
  };
}

export async function saveEconomy(supabase: DB, userId: string, s: EconomyState): Promise<EconomyState> {
  const level = levelFromXp(s.xp);
  const payload = {
    user_id: userId,
    coins: Math.max(0, Math.floor(s.coins)),
    gems: Math.max(0, Math.floor(s.gems)),
    xp: Math.max(0, Math.floor(s.xp)),
    level,
    owned: Array.from(new Set(s.owned)) as never,
    equipped: s.equipped,
    claimed: Array.from(new Set(s.claimed)) as never,
    pass_claimed: Array.from(new Set(s.pass_claimed)) as never,
    inventory: s.inventory as never,
    achievements: s.achievements as never,
    stats: s.stats as never,
    purchases: Array.from(new Set(s.purchases)) as never,
  };
  const { error } = await supabase.from("player_state").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
  return { ...s, level, coins: payload.coins, gems: payload.gems, xp: payload.xp };
}

export async function logEvent(
  supabase: DB,
  userId: string,
  kind: string,
  ref: string,
  payload: Record<string, unknown>,
) {
  await supabase.from("economy_events").insert({ user_id: userId, kind, ref, payload: payload as never });
}

/** Applique un lot de récompenses sur l'état (jamais de valeur négative). */
export function grant(
  s: EconomyState,
  r: { coins?: number; gems?: number; xp?: number; skins?: string[]; coinChests?: number; gemChests?: number },
): EconomyState {
  const owned = [...s.owned];
  for (const sk of r.skins ?? []) if (VALID.has(sk) && !owned.includes(sk as SkinId)) owned.push(sk as SkinId);
  const inv: Inventory = { ...s.inventory };
  if (r.coinChests) inv.coinChests = (inv.coinChests ?? 0) + r.coinChests;
  if (r.gemChests) inv.gemChests = (inv.gemChests ?? 0) + r.gemChests;
  const xp = s.xp + Math.max(0, r.xp ?? 0);
  return {
    ...s,
    coins: s.coins + Math.max(0, r.coins ?? 0),
    gems: s.gems + Math.max(0, r.gems ?? 0),
    xp,
    level: levelFromXp(xp),
    owned,
    inventory: inv,
  };
}
