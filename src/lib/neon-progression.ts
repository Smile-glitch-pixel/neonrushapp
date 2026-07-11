export type SkinId = "cyan" | "magenta" | "gold" | "lime" | "plasma" | "ghost" | "rainbow" | "eclipse";
export type GameMode = "classic" | "hardcore" | "zen" | "blitz";

export const SKINS: { id: SkinId; name: string; price: number; colors: [string, string, string]; rarity: "common" | "rare" | "epic" | "legendary" | "exclusive"; passOnly?: boolean }[] = [
  { id: "cyan", name: "Cyan", price: 0, colors: ["#ffffff", "#c88cff", "#a050ff"], rarity: "common" },
  { id: "magenta", name: "Magenta", price: 300, colors: ["#ffffff", "#ff7bd1", "#ff2e9a"], rarity: "common" },
  { id: "gold", name: "Gold", price: 800, colors: ["#fff8d0", "#ffd76b", "#ff9a2b"], rarity: "rare" },
  { id: "lime", name: "Lime", price: 800, colors: ["#e8ffd0", "#a8ff5c", "#3ddc4a"], rarity: "rare" },
  { id: "plasma", name: "Plasma", price: 1500, colors: ["#ffffff", "#7bf3ff", "#2a6bff"], rarity: "epic" },
  { id: "ghost", name: "Ghost", price: 2000, colors: ["#f0f0ff", "#a0a0d0", "#404060"], rarity: "epic" },
  { id: "rainbow", name: "Rainbow", price: 5000, colors: ["#ff2e6a", "#fff17a", "#7bf3ff"], rarity: "legendary" },
  // Exclusive pass reward — only obtainable at tier 100
  { id: "eclipse", name: "Eclipse", price: 0, colors: ["#ffffff", "#8b5cff", "#0b0620"], rarity: "exclusive", passOnly: true },
];

export const REWARD_MULT: Record<GameMode, number> = {
  zen: 0.4,
  classic: 1,
  blitz: 1.2,
  hardcore: 1.7,
};

export const MODES: { id: GameMode; nameKey: string; descKey: string }[] = [
  { id: "classic", nameKey: "modeClassic", descKey: "modeClassicDesc" },
  { id: "hardcore", nameKey: "modeHardcore", descKey: "modeHardcoreDesc" },
  { id: "zen", nameKey: "modeZen", descKey: "modeZenDesc" },
  { id: "blitz", nameKey: "modeBlitz", descKey: "modeBlitzDesc" },
];

/* ---------------- Battle Pass — 100 tiers ---------------- */
export const PASS_TIERS = 100;
export const PASS_XP_PER_TIER = 500;

export type PassReward = { type: "coins" | "xp" | "chest" | "skin"; value: number | SkinId };

// Deterministic 100-tier reward table. Only tier 100 grants the exclusive skin.
export const PASS_REWARDS: PassReward[] = Array.from({ length: PASS_TIERS }, (_, i) => {
  const tier = i + 1;
  if (tier === PASS_TIERS) return { type: "skin", value: "eclipse" };
  if (tier % 25 === 0) return { type: "chest", value: 3 }; // mega chest = 3 pulls
  if (tier % 10 === 0) return { type: "chest", value: 1 };
  if (tier % 5 === 0) return { type: "xp", value: 300 + tier * 4 };
  return { type: "coins", value: 60 + tier * 8 };
});

/* ---------------- Ranks ---------------- */
export const RANKS: { name: string; min: number; color: string }[] = [
  { name: "Bronze", min: 0, color: "#c88a5c" },
  { name: "Silver", min: 500, color: "#c8d0e0" },
  { name: "Gold", min: 1500, color: "#ffd76b" },
  { name: "Platinum", min: 3500, color: "#7bf3ff" },
  { name: "Diamond", min: 7000, color: "#c39bff" },
  { name: "Master", min: 12000, color: "#ff7bd1" },
  { name: "Neon", min: 20000, color: "#a8ff5c" },
];

export const rankFor = (best: number) => {
  let r = RANKS[0];
  for (const x of RANKS) if (best >= x.min) r = x;
  return r;
};

/* ---------------- Missions ---------------- */
export type MissionStat = "orbs" | "score" | "combo" | "runs" | "powers" | "blitzRuns" | "hardcoreScore";
export type MissionTemplate = {
  id: string;
  stat: MissionStat;
  target: number;
  xp: number;
  coins: number;
  titleKey: string;
};

export const DAILY_TEMPLATES: MissionTemplate[] = [
  { id: "d_orbs_50", stat: "orbs", target: 50, xp: 120, coins: 60, titleKey: "mDailyOrbs50" },
  { id: "d_orbs_120", stat: "orbs", target: 120, xp: 200, coins: 100, titleKey: "mDailyOrbs120" },
  { id: "d_score_500", stat: "score", target: 500, xp: 150, coins: 80, titleKey: "mDailyScore500" },
  { id: "d_score_1500", stat: "score", target: 1500, xp: 260, coins: 140, titleKey: "mDailyScore1500" },
  { id: "d_combo_10", stat: "combo", target: 10, xp: 140, coins: 70, titleKey: "mDailyCombo10" },
  { id: "d_combo_20", stat: "combo", target: 20, xp: 240, coins: 120, titleKey: "mDailyCombo20" },
  { id: "d_runs_3", stat: "runs", target: 3, xp: 100, coins: 50, titleKey: "mDailyRuns3" },
  { id: "d_powers_5", stat: "powers", target: 5, xp: 160, coins: 80, titleKey: "mDailyPowers5" },
];

export const WEEKLY_TEMPLATES: MissionTemplate[] = [
  { id: "w_orbs_600", stat: "orbs", target: 600, xp: 900, coins: 500, titleKey: "mWeeklyOrbs600" },
  { id: "w_score_12000", stat: "score", target: 12000, xp: 1200, coins: 700, titleKey: "mWeeklyScore12k" },
  { id: "w_combo_35", stat: "combo", target: 35, xp: 1000, coins: 600, titleKey: "mWeeklyCombo35" },
  { id: "w_runs_20", stat: "runs", target: 20, xp: 800, coins: 450, titleKey: "mWeeklyRuns20" },
  { id: "w_blitz_5", stat: "blitzRuns", target: 5, xp: 900, coins: 550, titleKey: "mWeeklyBlitz5" },
  { id: "w_hard_3000", stat: "hardcoreScore", target: 3000, xp: 1400, coins: 800, titleKey: "mWeeklyHard3k" },
  { id: "w_powers_25", stat: "powers", target: 25, xp: 900, coins: 500, titleKey: "mWeeklyPowers25" },
];

export type MissionState = { id: string; progress: number; claimed: boolean };
export type MissionsBucket = { seed: string; list: MissionState[] };
export type MissionsData = { daily: MissionsBucket; weekly: MissionsBucket };

const seedRand = (seed: string) => {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h += 0x6D2B79F5; let t = h; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
};

const pickN = <T,>(arr: T[], n: number, seed: string): T[] => {
  const r = seedRand(seed);
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
};

export const dailySeed = () => { const d = new Date(); return `d-${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`; };
export const weeklySeed = () => {
  const d = new Date();
  const jan1 = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  const week = Math.floor((days + jan1.getUTCDay()) / 7);
  return `w-${d.getUTCFullYear()}-${week}`;
};

export const generateMissions = (): MissionsData => ({
  daily: { seed: dailySeed(), list: pickN(DAILY_TEMPLATES, 3, dailySeed()).map((t) => ({ id: t.id, progress: 0, claimed: false })) },
  weekly: { seed: weeklySeed(), list: pickN(WEEKLY_TEMPLATES, 3, weeklySeed()).map((t) => ({ id: t.id, progress: 0, claimed: false })) },
});

export const refreshMissionsIfNeeded = (m: MissionsData | undefined): MissionsData => {
  const ds = dailySeed(), ws = weeklySeed();
  if (!m) return generateMissions();
  const daily = m.daily?.seed === ds ? m.daily : { seed: ds, list: pickN(DAILY_TEMPLATES, 3, ds).map((t) => ({ id: t.id, progress: 0, claimed: false })) };
  const weekly = m.weekly?.seed === ws ? m.weekly : { seed: ws, list: pickN(WEEKLY_TEMPLATES, 3, ws).map((t) => ({ id: t.id, progress: 0, claimed: false })) };
  return { daily, weekly };
};

export const findTemplate = (id: string): MissionTemplate | undefined =>
  DAILY_TEMPLATES.find((t) => t.id === id) || WEEKLY_TEMPLATES.find((t) => t.id === id);

/* ---------------- Progression storage ---------------- */
export type Progression = {
  coins: number;
  xp: number;
  claimed: number[];
  owned: SkinId[];
  equipped: SkinId;
  bestByMode: Record<GameMode, number>;
  missions: MissionsData;
  displayName?: string;
};

const KEY = "neon-rush-prog-v2";

export const defaultProg = (): Progression => ({
  coins: 0,
  xp: 0,
  claimed: [],
  owned: ["cyan"],
  equipped: "cyan",
  bestByMode: { classic: 0, hardcore: 0, zen: 0, blitz: 0 },
  missions: generateMissions(),
});

export const loadProg = (): Progression => {
  if (typeof window === "undefined") return defaultProg();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProg();
    const p = JSON.parse(raw);
    const merged: Progression = { ...defaultProg(), ...p };
    merged.missions = refreshMissionsIfNeeded(merged.missions);
    return merged;
  } catch {
    return defaultProg();
  }
};
export const saveProg = (p: Progression) => {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* noop */ }
};
