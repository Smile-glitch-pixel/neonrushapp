/**
 * NEON RUSH — Power-ups permanents (« perks »).
 * Achetés avec des pièces, débloqués par des conditions de progression
 * exigeantes, équipables par 5 au maximum. Les effets sont 100 % coopératifs :
 * aucun perk ne peut nuire à un joueur ni à son partenaire en Duo.
 */
import type { Stats, StatKey } from "./economy";

export type PerkId =
  | "start_shield" | "magnet_core" | "combo_keeper" | "score_boost" | "second_wind"
  | "slow_start" | "power_hunter" | "lucky_orbs" | "guardian" | "hazard_shrink";

export type Perk = {
  id: PerkId;
  icon: string;
  color: string;
  /** clé i18n du nom */
  nameKey: string;
  /** clé i18n de la description de l'effet */
  descKey: string;
  /** coût d'achat en pièces */
  cost: number;
  /** condition de déblocage (statistique de carrière) */
  req: { stat: StatKey; target: number };
};

export const MAX_LOADOUT = 5;

export const PERKS: Perk[] = [
  { id: "start_shield",  icon: "⛨",  color: "#a0ffea", nameKey: "pkStartShield",  descKey: "pkStartShieldD",  cost: 4000,  req: { stat: "runs",       target: 60 } },
  { id: "magnet_core",   icon: "◎",  color: "#ffb36b", nameKey: "pkMagnetCore",   descKey: "pkMagnetCoreD",   cost: 6500,  req: { stat: "orbs",       target: 4000 } },
  { id: "combo_keeper",  icon: "∞",  color: "#fff17a", nameKey: "pkComboKeeper",  descKey: "pkComboKeeperD",  cost: 7500,  req: { stat: "bestCombo",  target: 40 } },
  { id: "score_boost",   icon: "▲",  color: "#7bf3ff", nameKey: "pkScoreBoost",   descKey: "pkScoreBoostD",   cost: 9000,  req: { stat: "bestScore",  target: 12000 } },
  { id: "second_wind",   icon: "✚",  color: "#ff8ad1", nameKey: "pkSecondWind",   descKey: "pkSecondWindD",   cost: 15000, req: { stat: "bestScore",  target: 25000 } },
  { id: "slow_start",    icon: "⏱",  color: "#c39bff", nameKey: "pkSlowStart",    descKey: "pkSlowStartD",    cost: 5500,  req: { stat: "runs",       target: 200 } },
  { id: "power_hunter",  icon: "✦",  color: "#a8ff5c", nameKey: "pkPowerHunter",  descKey: "pkPowerHunterD",  cost: 8000,  req: { stat: "powers",     target: 300 } },
  { id: "lucky_orbs",    icon: "🍀", color: "#8affc1", nameKey: "pkLuckyOrbs",    descKey: "pkLuckyOrbsD",    cost: 10000, req: { stat: "chests",     target: 25 } },
  { id: "guardian",      icon: "🤝", color: "#ff7bd1", nameKey: "pkGuardian",     descKey: "pkGuardianD",     cost: 12000, req: { stat: "revives",    target: 25 } },
  { id: "hazard_shrink", icon: "◇",  color: "#c8d0e0", nameKey: "pkHazardShrink", descKey: "pkHazardShrinkD", cost: 14000, req: { stat: "duoRuns",    target: 30 } },
];

export const PERK_MAP: Record<PerkId, Perk> = PERKS.reduce((a, p) => { a[p.id] = p; return a; }, {} as Record<PerkId, Perk>);

export const findPerk = (id: string) => PERKS.find((p) => p.id === id);

/** Condition remplie ? (statistiques de carrière, jamais réinitialisées) */
export const perkUnlocked = (p: Perk, stats: Stats | Record<string, number>) =>
  ((stats as Record<string, number>)[p.req.stat] ?? 0) >= p.req.target;

/** Clé de stockage d'un perk possédé dans `purchases`. */
export const perkKey = (id: string) => `pw:${id}`;
export const ownsPerk = (purchases: string[] | undefined, id: string) =>
  (purchases ?? []).includes(perkKey(id));

/** Effets agrégés d'un chargement (utilisé par la boucle de jeu). */
export type Loadout = {
  startShield: boolean;
  magnetCore: boolean;
  comboKeeper: boolean;
  scoreBoost: boolean;
  secondWind: boolean;
  slowStart: boolean;
  powerHunter: boolean;
  luckyOrbs: boolean;
  guardian: boolean;
  hazardShrink: boolean;
};

export const emptyLoadout = (): Loadout => ({
  startShield: false, magnetCore: false, comboKeeper: false, scoreBoost: false, secondWind: false,
  slowStart: false, powerHunter: false, luckyOrbs: false, guardian: false, hazardShrink: false,
});

export const buildLoadout = (ids: string[] | undefined): Loadout => {
  const l = emptyLoadout();
  for (const id of (ids ?? []).slice(0, MAX_LOADOUT)) {
    switch (id as PerkId) {
      case "start_shield": l.startShield = true; break;
      case "magnet_core": l.magnetCore = true; break;
      case "combo_keeper": l.comboKeeper = true; break;
      case "score_boost": l.scoreBoost = true; break;
      case "second_wind": l.secondWind = true; break;
      case "slow_start": l.slowStart = true; break;
      case "power_hunter": l.powerHunter = true; break;
      case "lucky_orbs": l.luckyOrbs = true; break;
      case "guardian": l.guardian = true; break;
      case "hazard_shrink": l.hazardShrink = true; break;
    }
  }
  return l;
};

/* ------------------------- Coffres : limite quotidienne ------------------------- */
export const DAILY_CHEST_LIMIT = 7;
/** Jour UTC courant (le reset a lieu à minuit UTC). */
export const chestDayKey = () => new Date().toISOString().slice(0, 10);
/** Temps restant avant le reset, en ms. */
export const msUntilChestReset = () => {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  return next - now.getTime();
};
