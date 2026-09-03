import type { Progression, SkinId, GameMode, MissionsData } from "./neon-progression";
import { defaultProg, refreshMissionsIfNeeded } from "./neon-progression";
import { levelFromXp } from "./economy";

export type RemoteState = {
  coins: number;
  xp: number;
  claimed: number[];
  owned: string[];
  equipped: string;
  best_by_mode: Record<GameMode, number>;
  gems?: number;
  level?: number;
  inventory?: Record<string, number> | null;
  achievements?: Record<string, { claimed?: boolean }> | null;
  stats?: Record<string, number> | null;
  purchases?: string[] | null;
  missions?: MissionsData | null;
  pass_claimed?: number[] | null;
  settings?: Record<string, unknown> & {
    missions?: MissionsData; displayName?: string; duoBest?: number; duoRevives?: number;
    loadout?: string[]; chestDay?: string; chestUsed?: number;
  };
};

const mergeNumberMap = (
  a: Record<string, number> | null | undefined,
  b: Record<string, number> | null | undefined,
): Record<string, number> => {
  const out: Record<string, number> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b ?? {})) out[k] = Math.max(out[k] ?? 0, v ?? 0);
  return out;
};

export const mergeProg = (local: Progression, remote: RemoteState | null | undefined): Progression => {
  if (!remote) return local;
  const owned = Array.from(new Set([...local.owned, ...(remote.owned as SkinId[])])) as SkinId[];
  const claimed = Array.from(new Set([...local.claimed, ...remote.claimed, ...(remote.pass_claimed ?? [])]));
  const bestByMode: Progression["bestByMode"] = {
    classic: Math.max(local.bestByMode.classic || 0, remote.best_by_mode.classic || 0),
    hardcore: Math.max(local.bestByMode.hardcore || 0, remote.best_by_mode.hardcore || 0),
    zen: Math.max(local.bestByMode.zen || 0, remote.best_by_mode.zen || 0),
    blitz: Math.max(local.bestByMode.blitz || 0, remote.best_by_mode.blitz || 0),
  };
  // Merge missions per bucket: same seed -> take max progress, OR claimed flag
  const rMissions = remote.missions ?? remote.settings?.missions;
  const mergeBucket = (l: MissionsData["daily"], r: MissionsData["daily"] | undefined) => {
    if (!r || r.seed !== l.seed) return l;
    return {
      seed: l.seed,
      list: l.list.map((li) => {
        const ri = r.list.find((x) => x.id === li.id);
        if (!ri) return li;
        return { id: li.id, progress: Math.max(li.progress, ri.progress), claimed: li.claimed || ri.claimed };
      }),
    };
  };
  const localMissions = local.missions || defaultProg().missions;
  const missions: MissionsData = refreshMissionsIfNeeded({
    daily: mergeBucket(localMissions.daily, rMissions?.daily),
    weekly: mergeBucket(localMissions.weekly, rMissions?.weekly),
  });
  const xp = Math.max(local.xp, remote.xp);
  const achievements: Progression["achievements"] = { ...(local.achievements ?? {}) };
  for (const [id, st] of Object.entries(remote.achievements ?? {})) {
    achievements[id] = { claimed: achievements[id]?.claimed || st?.claimed };
  }
  const inv = mergeNumberMap(
    local.inventory as Record<string, number>,
    remote.inventory as Record<string, number>,
  );
  return {
    coins: Math.max(local.coins, remote.coins),
    gems: Math.max(local.gems ?? 0, remote.gems ?? 0),
    xp,
    level: Math.max(levelFromXp(xp), local.level ?? 1, remote.level ?? 1),
    claimed,
    owned,
    equipped: (owned.includes(remote.equipped as SkinId) ? remote.equipped : local.equipped) as SkinId,
    bestByMode,
    missions,
    inventory: { coinChests: inv.coinChests ?? 0, gemChests: inv.gemChests ?? 0 },
    achievements,
    stats: mergeNumberMap(local.stats, remote.stats),
    purchases: Array.from(new Set([...(local.purchases ?? []), ...(remote.purchases ?? [])])),
    loadout: (remote.settings?.loadout?.length ? remote.settings.loadout : local.loadout) ?? [],
    chestDay: remote.settings?.chestDay ?? local.chestDay,
    chestUsed:
      remote.settings?.chestDay && remote.settings.chestDay === local.chestDay
        ? Math.max(local.chestUsed ?? 0, remote.settings.chestUsed ?? 0)
        : (remote.settings?.chestDay && remote.settings.chestDay !== local.chestDay
            ? (local.chestDay ? (local.chestUsed ?? 0) : (remote.settings.chestUsed ?? 0))
            : local.chestUsed ?? 0),
    displayName: remote.settings?.displayName || local.displayName,
    duoBest: Math.max(local.duoBest ?? 0, remote.settings?.duoBest ?? 0),
    duoRevives: Math.max(local.duoRevives ?? 0, remote.settings?.duoRevives ?? 0),
  };
};

export const progToRemote = (p: Progression): RemoteState => ({
  coins: p.coins,
  xp: p.xp,
  claimed: p.claimed,
  owned: p.owned,
  equipped: p.equipped,
  best_by_mode: p.bestByMode,
  gems: p.gems ?? 0,
  level: p.level ?? levelFromXp(p.xp),
  inventory: (p.inventory ?? {}) as Record<string, number>,
  achievements: p.achievements ?? {},
  stats: p.stats ?? {},
  purchases: p.purchases ?? [],
  missions: p.missions,
  pass_claimed: p.claimed,
  settings: {
    missions: p.missions, displayName: p.displayName, duoBest: p.duoBest ?? 0, duoRevives: p.duoRevives ?? 0,
    loadout: p.loadout ?? [], chestDay: p.chestDay, chestUsed: p.chestUsed ?? 0,
  },
});
