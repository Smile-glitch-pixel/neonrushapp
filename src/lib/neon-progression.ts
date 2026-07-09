export type SkinId = "cyan" | "magenta" | "gold" | "lime" | "plasma" | "ghost" | "rainbow";
export type GameMode = "classic" | "hardcore" | "zen" | "blitz";

export const SKINS: { id: SkinId; name: string; price: number; colors: [string, string, string]; rarity: "common" | "rare" | "epic" | "legendary" }[] = [
  { id: "cyan", name: "Cyan", price: 0, colors: ["#ffffff", "#c88cff", "#a050ff"], rarity: "common" },
  { id: "magenta", name: "Magenta", price: 300, colors: ["#ffffff", "#ff7bd1", "#ff2e9a"], rarity: "common" },
  { id: "gold", name: "Gold", price: 800, colors: ["#fff8d0", "#ffd76b", "#ff9a2b"], rarity: "rare" },
  { id: "lime", name: "Lime", price: 800, colors: ["#e8ffd0", "#a8ff5c", "#3ddc4a"], rarity: "rare" },
  { id: "plasma", name: "Plasma", price: 1500, colors: ["#ffffff", "#7bf3ff", "#2a6bff"], rarity: "epic" },
  { id: "ghost", name: "Ghost", price: 2000, colors: ["#f0f0ff", "#a0a0d0", "#404060"], rarity: "epic" },
  { id: "rainbow", name: "Rainbow", price: 5000, colors: ["#ff2e6a", "#fff17a", "#7bf3ff"], rarity: "legendary" },
];

export const MODES: { id: GameMode; nameKey: string; descKey: string }[] = [
  { id: "classic", nameKey: "modeClassic", descKey: "modeClassicDesc" },
  { id: "hardcore", nameKey: "modeHardcore", descKey: "modeHardcoreDesc" },
  { id: "zen", nameKey: "modeZen", descKey: "modeZenDesc" },
  { id: "blitz", nameKey: "modeBlitz", descKey: "modeBlitzDesc" },
];

export const PASS_TIERS = 10;
export const PASS_XP_PER_TIER = 400;
export const PASS_REWARDS: { type: "coins" | "skin"; value: number | SkinId }[] = [
  { type: "coins", value: 100 },
  { type: "coins", value: 150 },
  { type: "skin", value: "magenta" },
  { type: "coins", value: 200 },
  { type: "coins", value: 250 },
  { type: "skin", value: "lime" },
  { type: "coins", value: 300 },
  { type: "coins", value: 400 },
  { type: "skin", value: "plasma" },
  { type: "skin", value: "rainbow" },
];

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

export type Progression = {
  coins: number;
  xp: number;
  claimed: number[];
  owned: SkinId[];
  equipped: SkinId;
  bestByMode: Record<GameMode, number>;
};

const KEY = "neon-rush-prog-v1";

export const loadProg = (): Progression => {
  if (typeof window === "undefined") return defaultProg();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultProg();
    const p = JSON.parse(raw);
    return { ...defaultProg(), ...p };
  } catch {
    return defaultProg();
  }
};
export const saveProg = (p: Progression) => {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* noop */ }
};
export const defaultProg = (): Progression => ({
  coins: 0,
  xp: 0,
  claimed: [],
  owned: ["cyan"],
  equipped: "cyan",
  bestByMode: { classic: 0, hardcore: 0, zen: 0, blitz: 0 },
});
