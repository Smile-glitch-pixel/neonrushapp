import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { SKINS, PASS_REWARDS, PASS_TIERS, PASS_XP_PER_TIER, findTemplate } from "@/lib/neon-progression";
import {
  CHESTS, rollChest, findAchievement, achievementUnlocked, GEM_TO_COINS,
  type ChestKind, type OfferContents, type StatKey, type Stats,
} from "@/lib/economy";
import { loadEconomy, saveEconomy, logEvent, grant } from "@/lib/economy.server";

/** État économique complet (source de vérité serveur). */
export const economySnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadEconomy(context.supabase, context.userId));

/** Achat d'un skin en boutique (pièces). Legendary/Mythic/Exclusive interdits. */
export const economyBuySkin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ skinId: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const sk = SKINS.find((s) => s.id === data.skinId);
    if (!sk) throw new Error("SKIN_UNKNOWN");
    if (sk.passOnly || sk.chestOnly || sk.price <= 0) throw new Error("SKIN_NOT_FOR_SALE");
    let s = await loadEconomy(context.supabase, context.userId);
    if (s.owned.includes(sk.id)) return { state: s, ok: false, reason: "OWNED" as const };
    if (s.coins < sk.price) return { state: s, ok: false, reason: "NOT_ENOUGH" as const };
    s = grant({ ...s, coins: s.coins - sk.price }, { skins: [sk.id] });
    s = await saveEconomy(context.supabase, context.userId, s);
    await logEvent(context.supabase, context.userId, "buy_skin", sk.id, { price: sk.price });
    return { state: s, ok: true as const };
  });

/** Équipe un skin possédé. */
export const economyEquipSkin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ skinId: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    let s = await loadEconomy(context.supabase, context.userId);
    if (!s.owned.includes(data.skinId as never)) return { state: s, ok: false as const };
    s = await saveEconomy(context.supabase, context.userId, { ...s, equipped: data.skinId as never });
    return { state: s, ok: true as const };
  });

/**
 * Ouvre un coffre. Le tirage est fait UNIQUEMENT côté serveur.
 * `fromInventory` consomme un coffre gagné (pass / boutique) au lieu de payer.
 */
export const economyOpenChest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) =>
    z.object({ kind: z.enum(["coin", "gem"]), fromInventory: z.boolean().optional() }).parse(i))
  .handler(async ({ data, context }) => {
    const kind = data.kind as ChestKind;
    const cfg = CHESTS[kind];
    let s = await loadEconomy(context.supabase, context.userId);
    const invKey = kind === "coin" ? "coinChests" : "gemChests";
    const held = s.inventory[invKey] ?? 0;
    const useInv = Boolean(data.fromInventory) && held > 0;
    if (!useInv) {
      const bal = cfg.currency === "coins" ? s.coins : s.gems;
      if (bal < cfg.cost) return { state: s, ok: false as const, reason: "NOT_ENOUGH" as const };
    }
    const drop = rollChest(kind, s.owned);
    if (useInv) s = { ...s, inventory: { ...s.inventory, [invKey]: held - 1 } };
    else if (cfg.currency === "coins") s = { ...s, coins: s.coins - cfg.cost };
    else s = { ...s, gems: s.gems - cfg.cost };
    s = grant(s, drop.type === "skin" ? { skins: [drop.skin] } : { coins: drop.coins });
    s = { ...s, stats: { ...s.stats, chests: (s.stats.chests ?? 0) + 1 } };
    s = await saveEconomy(context.supabase, context.userId, s);
    await logEvent(context.supabase, context.userId, "chest", `${kind}:${useInv ? "inv" : "paid"}`, { ...drop });
    return { state: s, ok: true as const, drop };
  });

/** Réclame un palier de Battle Pass (validé par l'XP réellement enregistrée). */
export const economyClaimPass = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ tier: z.number().int().min(0).max(PASS_TIERS - 1) }).parse(i))
  .handler(async ({ data, context }) => {
    let s = await loadEconomy(context.supabase, context.userId);
    const unlocked = Math.min(PASS_TIERS, Math.floor(s.xp / PASS_XP_PER_TIER));
    if (data.tier >= unlocked) return { state: s, ok: false as const, reason: "LOCKED" as const };
    if (s.claimed.includes(data.tier)) return { state: s, ok: false as const, reason: "ALREADY" as const };
    const r = PASS_REWARDS[data.tier]!;
    s = { ...s, claimed: [...s.claimed, data.tier], pass_claimed: [...s.pass_claimed, data.tier] };
    if (r.type === "coins") s = grant(s, { coins: r.value as number });
    else if (r.type === "xp") s = grant(s, { xp: r.value as number });
    else if (r.type === "chest") s = grant(s, { coinChests: r.value as number });
    else if (r.type === "skin") s = grant(s, { skins: [r.value as string] });
    // Bonus gemmes tous les 10 paliers pour alimenter l'économie premium.
    if ((data.tier + 1) % 10 === 0) s = grant(s, { gems: 15 });
    s = await saveEconomy(context.supabase, context.userId, s);
    await logEvent(context.supabase, context.userId, "pass_claim", `tier:${data.tier}`, { reward: r });
    return { state: s, ok: true as const, reward: r };
  });

/** Réclame une mission (progression lue en base, pas envoyée par le client). */
export const economyClaimMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const tpl = findTemplate(data.id);
    if (!tpl) throw new Error("MISSION_UNKNOWN");
    const { data: row, error } = await context.supabase
      .from("player_state").select("missions").eq("user_id", context.userId).maybeSingle();
    if (error) throw error;
    type M = { id: string; progress: number; claimed: boolean };
    type B = { seed: string; list: M[] };
    const missions = (row?.missions as { daily?: B; weekly?: B } | null) ?? {};
    let s = await loadEconomy(context.supabase, context.userId);
    let hit = false;
    const upd = (b: B | undefined): B | undefined => {
      if (!b) return b;
      return {
        ...b,
        list: b.list.map((m) => {
          if (m.id !== data.id || m.claimed || m.progress < tpl.target) return m;
          hit = true;
          return { ...m, claimed: true };
        }),
      };
    };
    const nextMissions = { daily: upd(missions.daily), weekly: upd(missions.weekly) };
    if (!hit) return { state: s, ok: false as const, reason: "NOT_READY" as const };
    s = grant(s, { coins: tpl.coins, xp: tpl.xp });
    s = await saveEconomy(context.supabase, context.userId, s);
    await context.supabase.from("player_state")
      .update({ missions: nextMissions as never }).eq("user_id", context.userId);
    await logEvent(context.supabase, context.userId, "mission_claim", data.id, { coins: tpl.coins, xp: tpl.xp });
    return { state: s, ok: true as const, missions: nextMissions, reward: { coins: tpl.coins, xp: tpl.xp } };
  });

/** Réclame un succès débloqué (statistiques cumulées serveur). */
export const economyClaimAchievement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ id: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const a = findAchievement(data.id);
    if (!a) throw new Error("ACHIEVEMENT_UNKNOWN");
    let s = await loadEconomy(context.supabase, context.userId);
    if (s.achievements[a.id]?.claimed) return { state: s, ok: false as const, reason: "ALREADY" as const };
    if (!achievementUnlocked(a, s.stats)) return { state: s, ok: false as const, reason: "LOCKED" as const };
    s = grant({ ...s, achievements: { ...s.achievements, [a.id]: { claimed: true } } },
      { coins: a.coins, gems: a.gems, xp: a.xp });
    s = await saveEconomy(context.supabase, context.userId, s);
    await logEvent(context.supabase, context.userId, "achievement", a.id, { coins: a.coins, gems: a.gems, xp: a.xp });
    return { state: s, ok: true as const, reward: { coins: a.coins, gems: a.gems, xp: a.xp } };
  });

/** Statistiques de fin de partie : fusion monotone (jamais de baisse). */
export const economyTrackStats = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({
    add: z.record(z.string(), z.number().int().min(0).max(1_000_000)).optional(),
    max: z.record(z.string(), z.number().int().min(0).max(10_000_000)).optional(),
  }).parse(i))
  .handler(async ({ data, context }) => {
    let s = await loadEconomy(context.supabase, context.userId);
    const stats: Stats = { ...s.stats };
    for (const [k, v] of Object.entries(data.add ?? {})) {
      stats[k as StatKey] = (stats[k as StatKey] ?? 0) + v;
    }
    for (const [k, v] of Object.entries(data.max ?? {})) {
      stats[k as StatKey] = Math.max(stats[k as StatKey] ?? 0, v);
    }
    s = await saveEconomy(context.supabase, context.userId, { ...s, stats });
    return s;
  });

/** Offres de la boutique actuellement actives. */
export const economyListOffers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("store_offers")
      .select("id, title, kind, currency, price, contents, once_per_player, ends_at")
      .eq("active", true)
      .order("price", { ascending: true });
    if (error) throw error;
    const now = Date.now();
    return (data ?? []).filter((o) => !o.ends_at || new Date(o.ends_at).getTime() > now);
  });

/** Achat d'une offre (limite « une fois par joueur » vérifiée côté serveur). */
export const economyBuyOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ offerId: z.string() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: offer, error } = await context.supabase
      .from("store_offers").select("*").eq("id", data.offerId).eq("active", true).maybeSingle();
    if (error) throw error;
    let s = await loadEconomy(context.supabase, context.userId);
    if (!offer) return { state: s, ok: false as const, reason: "UNKNOWN" as const };
    if (offer.ends_at && new Date(offer.ends_at).getTime() < Date.now()) {
      return { state: s, ok: false as const, reason: "EXPIRED" as const };
    }
    if (offer.once_per_player && s.purchases.includes(offer.id)) {
      return { state: s, ok: false as const, reason: "ALREADY" as const };
    }
    const bal = offer.currency === "gems" ? s.gems : s.coins;
    if (bal < offer.price) return { state: s, ok: false as const, reason: "NOT_ENOUGH" as const };
    const c = (offer.contents as OfferContents | null) ?? {};
    s = offer.currency === "gems" ? { ...s, gems: s.gems - offer.price } : { ...s, coins: s.coins - offer.price };
    s = grant({ ...s, purchases: [...s.purchases, offer.id] }, {
      coins: c.coins ?? 0, gems: c.gems ?? 0, coinChests: c.chests ?? 0, skins: c.skins ?? [],
    });
    s = await saveEconomy(context.supabase, context.userId, s);
    await logEvent(context.supabase, context.userId, "offer", offer.id, { price: offer.price, currency: offer.currency, contents: c });
    return { state: s, ok: true as const, contents: c };
  });

/** Conversion gemmes → pièces (jamais l'inverse). */
export const economyConvertGems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i: unknown) => z.object({ gems: z.number().int().min(1).max(10000) }).parse(i))
  .handler(async ({ data, context }) => {
    let s = await loadEconomy(context.supabase, context.userId);
    if (s.gems < data.gems) return { state: s, ok: false as const, reason: "NOT_ENOUGH" as const };
    s = grant({ ...s, gems: s.gems - data.gems }, { coins: data.gems * GEM_TO_COINS });
    s = await saveEconomy(context.supabase, context.userId, s);
    await logEvent(context.supabase, context.userId, "convert_gems", `${data.gems}`, { coins: data.gems * GEM_TO_COINS });
    return { state: s, ok: true as const, coins: data.gems * GEM_TO_COINS };
  });
