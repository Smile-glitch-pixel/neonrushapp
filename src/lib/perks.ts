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
  startShield: false,
  magnetCore: false,
  comboKeeper: false,
  scoreBoost: false,
  secondWind: false,
  slowStart: false,
  powerHunter: false,
  luckyOrbs: false,
  guardian: false,
  hazardShrink: false,
});

export const DAILY_CHEST_LIMIT = 7;

/** Jour UTC courant (le reset a lieu à minuit UTC). */
export const chestDayKey = () => new Date().toISOString().slice(0, 10);

/** Temps restant avant le reset, en ms. */
export const msUntilChestReset = () => {
  const now = new Date();
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0);
  return next - now.getTime();
};
