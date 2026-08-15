// ---------------------------------------------------------------------------
// Neon Rush — Économie (client-safe, pure)
// Gemmes, niveaux, coffres, succès, statistiques, boutique.
// Ce module ne contient AUCUN accès réseau : il est importé côté client ET
// côté serveur pour que les règles soient strictement identiques.
// ---------------------------------------------------------------------------
import { SKINS, RARITY_COIN_VALUE, type Rarity, type SkinId } from "./neon-progression";

/* ------------------------------- Niveaux ------------------------------- */
export const XP_PER_LEVEL = 1200;
export const MAX_LEVEL = 200;
export const levelFromXp = (xp: number) => Math.max(1, Math.min(MAX_LEVEL, 1 + Math.floor(xp / XP_PER_LEVEL)));
export const xpIntoLevel = (xp: number) => xp % XP_PER_LEVEL;

/* -------------------------------- Coffres ------------------------------- */
export type ChestKind = "coin" | "gem";
export const CHESTS: Record<ChestKind, { cost: number; currency: "coins" | "gems"; weights: Record<Exclude<Rarity, "exclusive">, number> }> = {
  coin: {
    cost: 500,
    currency: "coins",
    weights: { common: 55, rare: 27, epic: 12, legendary: 5, mythic: 1 },
  },
  gem: {
    cost: 60,
    currency: "gems",
    weights: { common: 18, rare: 30, epic: 32, legendary: 15, mythic: 5 },
  },
};

export type ChestDrop =
  | { type: "skin"; skin: SkinId; rarity: Exclude<Rarity, "exclusive"> }
  | { type: "coins"; coins: number; rarity: Exclude<Rarity, "exclusive"> };

/** Tirage d'un coffre. Les skins Exclusive (Battle Pass) ne tombent jamais. */
export const rollChest = (kind: ChestKind, ownedIds: SkinId[]): ChestDrop => {
  const w = CHESTS[kind].weights;
  const rarities = Object.keys(w) as Array<Exclude<Rarity, "exclusive">>;
  const total = rarities.reduce((a, r) => a + w[r], 0);
  let roll = Math.random() * total;
  let picked: Exclude<Rarity, "exclusive"> = "common";
  for (const r of rarities) { if (roll < w[r]) { picked = r; break; } roll -= w[r]; }
  const pool = SKINS.filter((s) => s.rarity === picked && !s.passOnly && !ownedIds.includes(s.id));
  if (pool.length > 0) {
    const s = pool[Math.floor(Math.random() * pool.length)]!;
    return { type: "skin", skin: s.id, rarity: picked };
  }
  return { type: "coins", coins: RARITY_COIN_VALUE[picked], rarity: picked };
};

/* -------------------------------- Succès -------------------------------- */
export type StatKey =
  | "runs" | "orbs" | "powers" | "bestCombo" | "bestScore"
  | "revives" | "chests" | "duoRuns" | "coinsEarned";

export type Stats = Partial<Record<StatKey, number>>;

export type Achievement = {
  id: string;
  stat: StatKey;
  target: number;
  coins: number;
  gems: number;
  xp: number;
  titleKey: string;
};

export const ACHIEVEMENTS: Achievement[] = [
  { id: "a_runs_10",     stat: "runs",       target: 10,    coins: 200,  gems: 5,  xp: 200,  titleKey: "aRuns10" },
  { id: "a_runs_100",    stat: "runs",       target: 100,   coins: 1200, gems: 25, xp: 900,  titleKey: "aRuns100" },
  { id: "a_orbs_1000",   stat: "orbs",       target: 1000,  coins: 800,  gems: 15, xp: 600,  titleKey: "aOrbs1000" },
  { id: "a_orbs_10000",  stat: "orbs",       target: 10000, coins: 3000, gems: 60, xp: 2000, titleKey: "aOrbs10000" },
  { id: "a_combo_30",    stat: "bestCombo",  target: 30,    coins: 600,  gems: 10, xp: 500,  titleKey: "aCombo30" },
  { id: "a_combo_60",    stat: "bestCombo",  target: 60,    coins: 2000, gems: 40, xp: 1500, titleKey: "aCombo60" },
  { id: "a_score_5000",  stat: "bestScore",  target: 5000,  coins: 700,  gems: 12, xp: 600,  titleKey: "aScore5000" },
  { id: "a_score_20000", stat: "bestScore",  target: 20000, coins: 3500, gems: 70, xp: 2500, titleKey: "aScore20000" },
  { id: "a_powers_100",  stat: "powers",     target: 100,   coins: 700,  gems: 12, xp: 600,  titleKey: "aPowers100" },
  { id: "a_chests_25",   stat: "chests",     target: 25,    coins: 1000, gems: 20, xp: 800,  titleKey: "aChests25" },
  { id: "a_revives_10",  stat: "revives",    target: 10,    coins: 900,  gems: 20, xp: 700,  titleKey: "aRevives10" },
  { id: "a_duo_20",      stat: "duoRuns",    target: 20,    coins: 1500, gems: 30, xp: 1200, titleKey: "aDuo20" },
];

export const findAchievement = (id: string) => ACHIEVEMENTS.find((a) => a.id === id);

export type AchievementState = { claimed?: boolean };
export type AchievementsData = Record<string, AchievementState>;

/** Un succès est débloqué dès que la statistique cumulée atteint la cible. */
export const achievementUnlocked = (a: Achievement, stats: Stats) => (stats[a.stat] ?? 0) >= a.target;

/* ------------------------------ Inventaire ------------------------------ */
export type Inventory = { coinChests?: number; gemChests?: number };

/* ------------------------------- Boutique ------------------------------- */
export type OfferContents = { coins?: number; gems?: number; chests?: number; skins?: string[] };
export type StoreOffer = {
  id: string;
  title: string;
  kind: string;
  currency: "coins" | "gems";
  price: number;
  contents: OfferContents;
  once_per_player: boolean;
  ends_at: string | null;
};

/** Conversion gemmes → pièces (uniquement dans ce sens, jamais l'inverse). */
export const GEM_TO_COINS = 25;
