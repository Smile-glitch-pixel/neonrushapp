import type { Progression, SkinId, GameMode } from "./neon-progression";

export type RemoteState = {
  coins: number;
  xp: number;
  claimed: number[];
  owned: string[];
  equipped: string;
  best_by_mode: Record<GameMode, number>;
  settings?: Record<string, unknown>;
};

export const mergeProg = (local: Progression, remote: RemoteState | null | undefined): Progression => {
  if (!remote) return local;
  const owned = Array.from(new Set([...local.owned, ...(remote.owned as SkinId[])])) as SkinId[];
  const claimed = Array.from(new Set([...local.claimed, ...remote.claimed]));
  const bestByMode: Progression["bestByMode"] = {
    classic: Math.max(local.bestByMode.classic || 0, remote.best_by_mode.classic || 0),
    hardcore: Math.max(local.bestByMode.hardcore || 0, remote.best_by_mode.hardcore || 0),
    zen: Math.max(local.bestByMode.zen || 0, remote.best_by_mode.zen || 0),
    blitz: Math.max(local.bestByMode.blitz || 0, remote.best_by_mode.blitz || 0),
  };
  return {
    coins: Math.max(local.coins, remote.coins),
    xp: Math.max(local.xp, remote.xp),
    claimed,
    owned,
    equipped: (owned.includes(remote.equipped as SkinId) ? remote.equipped : local.equipped) as SkinId,
    bestByMode,
  };
};

export const progToRemote = (p: Progression): RemoteState => ({
  coins: p.coins,
  xp: p.xp,
  claimed: p.claimed,
  owned: p.owned,
  equipped: p.equipped,
  best_by_mode: p.bestByMode,
});
