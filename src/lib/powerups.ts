/**
 * NEON RUSH — Registre extensible des power-ups.
 * Ajouter un power-up = ajouter une entrée ici (visuel, durée, effet, coop).
 * Aucun power-up ne peut nuire à un joueur : le Duo est 100% coopératif.
 */
export type PowerId = "shield" | "slow" | "x2" | "magnet" | "boost" | "second";

export type PowerDef = {
  id: PowerId;
  /** Couleur d'identité (canvas + HUD + particules) */
  color: string;
  /** Glyphe dessiné dans l'orbe de power-up */
  glyph: string;
  /** Clé i18n du nom */
  labelKey: string;
  /** Clé i18n de l'effet coopératif (Duo) */
  coopKey: string;
  /** Durée de l'effet (0 = charge instantanée/persistante) */
  durationMs: number;
  /** Poids d'apparition */
  weight: number;
  /** Forme dessinée */
  shape: "hex" | "diamond" | "ring" | "star";
};

export const POWERS: PowerDef[] = [
  { id: "shield", color: "#a0ffea", glyph: "⛨", labelKey: "shield", coopKey: "pwShieldCoop", durationMs: 6000, weight: 22, shape: "hex" },
  { id: "slow", color: "#c39bff", glyph: "⏱", labelKey: "slow", coopKey: "pwSlowCoop", durationMs: 5000, weight: 18, shape: "diamond" },
  { id: "x2", color: "#fff17a", glyph: "×2", labelKey: "x2", coopKey: "pwX2Coop", durationMs: 8000, weight: 18, shape: "star" },
  { id: "magnet", color: "#ffb36b", glyph: "◎", labelKey: "magnet", coopKey: "pwMagnetCoop", durationMs: 7000, weight: 18, shape: "ring" },
  { id: "boost", color: "#7bf3ff", glyph: "»", labelKey: "boost", coopKey: "pwBoostCoop", durationMs: 5000, weight: 16, shape: "diamond" },
  { id: "second", color: "#ff8ad1", glyph: "✚", labelKey: "second", coopKey: "pwSecondCoop", durationMs: 0, weight: 8, shape: "star" },
];

export const POWER_MAP: Record<PowerId, PowerDef> = POWERS.reduce((acc, p) => {
  acc[p.id] = p;
  return acc;
}, {} as Record<PowerId, PowerDef>);

export const POWER_IDS = POWERS.map((p) => p.id);

export type PowerTimers = Record<PowerId, number>;
export const emptyTimers = (): PowerTimers =>
  POWER_IDS.reduce((a, id) => { a[id] = 0; return a; }, {} as PowerTimers);

/** Tirage pondéré d'un power-up. */
export function rollPower(): PowerDef {
  const total = POWERS.reduce((s, p) => s + p.weight, 0);
  let r = Math.random() * total;
  for (const p of POWERS) { r -= p.weight; if (r <= 0) return p; }
  return POWERS[0];
}
