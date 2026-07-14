export type SkinId =
  | "cyan" | "magenta" | "lime" | "coral" | "mint"
  | "gold" | "plasma" | "ember" | "ice" | "bubble" | "dusk"
  | "ghost" | "void" | "aurora" | "solar" | "prism"
  | "rainbow" | "phoenix" | "quantum"
  | "singularity"
  | "eclipse"
  | "azure" | "rose" | "olive" | "sand" | "sky"
  | "obsidian" | "topaz" | "jade" | "cobalt" | "ruby"
  | "nebula" | "vortex" | "chroma" | "arcane" | "spectre"
  | "cosmic" | "inferno" | "tempest" | "abyss"
  | "genesis";

export type Rarity = "common" | "rare" | "epic" | "legendary" | "mythic" | "exclusive";
export type GameMode = "classic" | "hardcore" | "zen" | "blitz";

export type Skin = {
  id: SkinId;
  name: string;
  price: number;         // 0 when not shop-purchasable
  colors: [string, string, string];
  rarity: Rarity;
  passOnly?: boolean;
  chestOnly?: boolean;   // legendary/mythic — never sold in shop
};

export const SKINS: Skin[] = [
  // ---------- Common (5) — simple color swaps ----------
  { id: "cyan",    name: "Cyan",     price: 0,    colors: ["#ffffff", "#c88cff", "#a050ff"], rarity: "common" },
  { id: "magenta", name: "Magenta",  price: 300,  colors: ["#ffffff", "#ff7bd1", "#ff2e9a"], rarity: "common" },
  { id: "lime",    name: "Lime",     price: 300,  colors: ["#e8ffd0", "#a8ff5c", "#3ddc4a"], rarity: "common" },
  { id: "coral",   name: "Coral",    price: 300,  colors: ["#ffefe0", "#ff9a7b", "#ff5236"], rarity: "common" },
  { id: "mint",    name: "Mint",     price: 300,  colors: ["#e6fff5", "#7bf3c8", "#12c084"], rarity: "common" },

  // ---------- Rare (6) — new trail + small particles ----------
  { id: "gold",    name: "Gold",     price: 900,  colors: ["#fff8d0", "#ffd76b", "#ff9a2b"], rarity: "rare" },
  { id: "plasma",  name: "Plasma",   price: 900,  colors: ["#ffffff", "#7bf3ff", "#2a6bff"], rarity: "rare" },
  { id: "ember",   name: "Ember",    price: 900,  colors: ["#fff0d6", "#ffb36b", "#c33021"], rarity: "rare" },
  { id: "ice",     name: "Ice",      price: 900,  colors: ["#e8f8ff", "#9ee0ff", "#4a8dd6"], rarity: "rare" },
  { id: "bubble",  name: "Bubble",   price: 900,  colors: ["#ffe8f8", "#ff9cd8", "#c94ec6"], rarity: "rare" },
  { id: "dusk",    name: "Dusk",     price: 900,  colors: ["#ffd9e8", "#c084fc", "#4a2c8f"], rarity: "rare" },

  // ---------- Epic (5) — new effects, pulsing aura ----------
  { id: "ghost",   name: "Ghost",    price: 2500, colors: ["#f0f0ff", "#a0a0d0", "#404060"], rarity: "epic" },
  { id: "void",    name: "Void",     price: 2500, colors: ["#3b1e7a", "#8b3ff5", "#000000"], rarity: "epic" },
  { id: "aurora",  name: "Aurora",   price: 2500, colors: ["#c9ffea", "#7bf3ff", "#8bff7b"], rarity: "epic" },
  { id: "solar",   name: "Solar",    price: 2500, colors: ["#fff2a0", "#ffb020", "#ff4020"], rarity: "epic" },
  { id: "prism",   name: "Prism",    price: 2500, colors: ["#ffffff", "#ff7bd1", "#7bf3ff"], rarity: "epic" },

  // ---------- Legendary (3) — chest only, big glow + long trail ----------
  { id: "rainbow", name: "Rainbow",  price: 0,    colors: ["#ff2e6a", "#fff17a", "#7bf3ff"], rarity: "legendary", chestOnly: true },
  { id: "phoenix", name: "Phoenix",  price: 0,    colors: ["#fff8d0", "#ff8020", "#c31020"], rarity: "legendary", chestOnly: true },
  { id: "quantum", name: "Quantum",  price: 0,    colors: ["#e0f8ff", "#5b8dff", "#ff2ea8"], rarity: "legendary", chestOnly: true },

  // ---------- Mythic (1) — chest only, aura + unique sound ----------
  { id: "singularity", name: "Singularity", price: 0, colors: ["#ffffff", "#c39bff", "#000000"], rarity: "mythic", chestOnly: true },

  // ---------- Exclusive Battle Pass reward ----------
  { id: "eclipse", name: "Eclipse",  price: 0,    colors: ["#ffffff", "#8b5cff", "#0b0620"], rarity: "exclusive", passOnly: true },

  // ---------- Extra Commons ----------
  { id: "azure",   name: "Azure",    price: 300,  colors: ["#e8f3ff", "#7bb3ff", "#2050c8"], rarity: "common" },
  { id: "rose",    name: "Rose",     price: 300,  colors: ["#fff0f5", "#ffb0c8", "#e04070"], rarity: "common" },
  { id: "olive",   name: "Olive",    price: 300,  colors: ["#f5f8d0", "#c8d060", "#6a7a20"], rarity: "common" },
  { id: "sand",    name: "Sand",     price: 300,  colors: ["#fff5e0", "#f0c88a", "#a06a20"], rarity: "common" },
  { id: "sky",     name: "Sky",      price: 300,  colors: ["#f0faff", "#a8dcff", "#4a90d6"], rarity: "common" },

  // ---------- Extra Rares ----------
  { id: "obsidian", name: "Obsidian", price: 900, colors: ["#c8c8d8", "#6a6a80", "#101018"], rarity: "rare" },
  { id: "topaz",    name: "Topaz",    price: 900, colors: ["#fff8d0", "#ffb060", "#c08020"], rarity: "rare" },
  { id: "jade",     name: "Jade",     price: 900, colors: ["#d8fff0", "#60d0a0", "#207050"], rarity: "rare" },
  { id: "cobalt",   name: "Cobalt",   price: 900, colors: ["#e0e8ff", "#6080e8", "#1030a0"], rarity: "rare" },
  { id: "ruby",     name: "Ruby",     price: 900, colors: ["#ffe0e8", "#ff5070", "#a01030"], rarity: "rare" },

  // ---------- Extra Epics ----------
  { id: "nebula",  name: "Nebula",   price: 2500, colors: ["#e0d0ff", "#a060ff", "#301060"], rarity: "epic" },
  { id: "vortex",  name: "Vortex",   price: 2500, colors: ["#d0f0ff", "#40b0e0", "#101040"], rarity: "epic" },
  { id: "chroma",  name: "Chroma",   price: 2500, colors: ["#ff70a0", "#70e0ff", "#a0ff70"], rarity: "epic" },
  { id: "arcane",  name: "Arcane",   price: 2500, colors: ["#f0e0ff", "#c080ff", "#4020a0"], rarity: "epic" },
  { id: "spectre", name: "Spectre",  price: 2500, colors: ["#e0fff8", "#80d8c8", "#204048"], rarity: "epic" },

  // ---------- Extra Legendaries ----------
  { id: "cosmic",  name: "Cosmic",   price: 0,    colors: ["#ffd0ff", "#8060ff", "#000030"], rarity: "legendary", chestOnly: true },
  { id: "inferno", name: "Inferno",  price: 0,    colors: ["#fff0c0", "#ff6020", "#800000"], rarity: "legendary", chestOnly: true },
  { id: "tempest", name: "Tempest",  price: 0,    colors: ["#d8f0ff", "#60a0ff", "#101050"], rarity: "legendary", chestOnly: true },
  { id: "abyss",   name: "Abyss",    price: 0,    colors: ["#a0e0ff", "#2060a0", "#000010"], rarity: "legendary", chestOnly: true },

  // ---------- Extra Mythic ----------
  { id: "genesis", name: "Genesis",  price: 0,    colors: ["#ffffff", "#ffd0f0", "#200040"], rarity: "mythic", chestOnly: true },
];

/* ---------------- Rarity metadata & FX ---------------- */
export const RARITY_COLOR: Record<Rarity, string> = {
  common:    "#c8d0e0",
  rare:      "#7bf3ff",
  epic:      "#c39bff",
  legendary: "#ffd76b",
  mythic:    "#ff2e9a",
  exclusive: "#8b5cff",
};

// In-game visual/audio FX applied to the player based on the equipped skin's rarity.
export type SkinFx = {
  trailLen: number;      // number of trail points kept
  particles: number;     // extra multiplier for pickup burst
  pulse: number;         // scale amplitude (0 = none)
  aura: number;          // outer aura radius multiplier (0 = none)
  soundBoost: number;    // extra tone layered on pickup (0 = none)
};
export const RARITY_FX:
Record<Rarity,SkinFx> = {


common:
{
 trailLen:20,
 particles:1,
 pulse:0,
 aura:0,
 soundBoost:0
},


rare:
{
 trailLen:35,
 particles:1.5,
 pulse:0.03,
 aura:0.2,
 soundBoost:0.1
},


epic:
{
 trailLen:50,
 particles:2,
 pulse:0.06,
 aura:1.3,
 soundBoost:0.3
},


legendary:
{
 trailLen:70,
 particles:3,
 pulse:0.1,
 aura:2,
 soundBoost:0.7
},


mythic:
{
 trailLen:100,
 particles:4,
 pulse:0.15,
 aura:3,
 soundBoost:1.2
},


exclusive:
{
 trailLen:80,
 particles:3,
 pulse:0.12,
 aura:2.5,
 soundBoost:1
}


};

/* ---------------- Chest rewards ---------------- */

// 50% chance d'obtenir des pièces
// 50% chance d'obtenir un skin

export const CHEST_SKIN_CHANCE = 0.5;

export const CHEST_WEIGHTS: Record<Exclude<Rarity,"exclusive">,number> = {

  common:55,
  rare:28,
  epic:12,
  legendary:4,
  mythic:1,

};


export const RARITY_COIN_VALUE:
Record<Exclude<Rarity,"exclusive">,number> = {

  common:150,
  rare:400,
  epic:1000,
  legendary:2500,
  mythic:7000,

};



export type ChestReward =
| {
    type:"skin";
    skin:SkinId;
    rarity:Exclude<Rarity,"exclusive">;
  }
| {
    type:"coins";
    coins:number;
    rarity:Exclude<Rarity,"exclusive">;
};



export const rollChestReward = (
  ownedIds:SkinId[]
):ChestReward=>{


  // 50% pièces directement
  if(Math.random() > CHEST_SKIN_CHANCE)
  {

    const values =
    Object.entries(RARITY_COIN_VALUE);

    const random =
    values[
      Math.floor(
        Math.random()*values.length
      )
    ];


    return {
      type:"coins",
      coins:random[1],
      rarity:random[0] as Exclude<Rarity,"exclusive">
    };

  let rarity:
  Exclude<Rarity,"exclusive">
  ="common";


  for(const r of rarities)
  {

    roll -= CHEST_WEIGHTS[r];

    if(roll<=0)
    {
      rarity=r;
      break;
    }

  }



  const available =
  SKINS.filter(
    s =>
    s.rarity===rarity &&
    !s.chestOnly===false &&
    !ownedIds.includes(s.id)
  );



  if(available.length)
  {

    const skin =
    available[
      Math.floor(
        Math.random()*available.length
      )
    ];


    return {
      type:"skin",
      skin:skin.id,
      rarity
    };

  }



  // Si tous les skins sont possédés
  return {

    type:"coins",

    coins:
    RARITY_COIN_VALUE[rarity],

    rarity

  };

};



export const drawChestSkin =
(
ownedIds:SkinId[]
):
{
skin:SkinId;
rarity:Rarity
}|null=>{


const reward =
rollChestReward(ownedIds);


return reward.type==="skin"
?
{
 skin:reward.skin,
 rarity:reward.rarity
}
:null;


};



export const CHEST_COST = 500;

export const REWARD_MULT:
Record<GameMode,number> = {


  // Mode Zen
  zen:0.5,


  // Mode Classique
  classic:1,


  // Plus rapide
  blitz:1.35,


  // Très difficile
  hardcore:1.8,


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
  if (tier % 25 === 0) return { type: "chest", value: 3 };
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
    // Filter out any owned/equipped id that no longer exists in the catalog
    const validIds = new Set(SKINS.map((s) => s.id));
    merged.owned = (merged.owned || []).filter((id) => validIds.has(id));
    if (!merged.owned.includes("cyan")) merged.owned.push("cyan");
    if (!validIds.has(merged.equipped)) merged.equipped = "cyan";
    merged.missions = refreshMissionsIfNeeded(merged.missions);
    return merged;
  } catch {
    return defaultProg();
  }
};
export const saveProg = (p: Progression) => {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* noop */ }
};
