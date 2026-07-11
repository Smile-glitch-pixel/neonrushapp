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
  settings: z.record(z.string(), z.any()).optional(),
});

export const pullPlayerState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("player_state")
      .select("coins, xp, claimed, owned, equipped, best_by_mode, settings, updated_at")
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
        settings: (data.settings ?? {}) as never,
      }, { onConflict: "user_id" });
    if (error) throw error;
    return { ok: true };
  });
