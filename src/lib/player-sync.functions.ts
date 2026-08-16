import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const StateSchema = z.object({
  coins: z.number().int().min(0),
  xp: z.number().int().min(0),
  claimed: z.array(z.number().int().min(0)),
  owned: z.array(z.string()),
  equipped: z.string(),
  best_by_mode: z.object({
    classic: z.number().int().min(0),
    hardcore: z.number().int().min(0),
    zen: z.number().int().min(0),
    blitz: z.number().int().min(0),
  }),
  gems: z.number().int().min(0).optional(),
  level: z.number().int().min(1).optional(),
  inventory: z.record(z.string(), z.number().int().min(0)).optional(),
  achievements: z.record(z.string(), z.object({ claimed: z.boolean().optional() })).optional(),
  stats: z.record(z.string(), z.number()).optional(),
  purchases: z.array(z.string()).optional(),
  missions: z.any().optional(),
  pass_claimed: z.array(z.number().int().min(0)).optional(),
  settings: z.record(z.string(), z.any()).optional(),
});

const SELECT =
  "coins, xp, claimed, owned, equipped, best_by_mode, settings, gems, level, inventory, achievements, stats, purchases, missions, pass_claimed, updated_at";

export const pullPlayerState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("player_state")
      .select(SELECT)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return data;
  });

export const pushPlayerState = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => StateSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("player_state")
      .upsert({
        user_id: context.userId,
        coins: data.coins,
        xp: data.xp,
        claimed: data.claimed,
        owned: data.owned,
        equipped: data.equipped,
        best_by_mode: data.best_by_mode,
        gems: data.gems ?? 0,
        level: data.level ?? 1,
        inventory: (data.inventory ?? {}) as never,
        achievements: (data.achievements ?? {}) as never,
        stats: (data.stats ?? {}) as never,
        purchases: (data.purchases ?? []) as never,
        missions: (data.missions ?? {}) as never,
        pass_claimed: (data.pass_claimed ?? []) as never,
        settings: (data.settings ?? {}) as never,
      }, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true };
  });
