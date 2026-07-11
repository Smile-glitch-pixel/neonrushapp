import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ModeEnum = z.enum(["classic", "hardcore", "zen", "blitz"]);

export const submitScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      mode: ModeEnum,
      score: z.number().int().min(0).max(10_000_000),
      display_name: z.string().max(40).nullable().optional(),
      equipped_skin: z.string().max(24).nullable().optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    // Only keep the highest score per (user, mode)
    const { data: existing } = await context.supabase
      .from("leaderboard_scores")
      .select("id, score")
      .eq("user_id", context.userId)
      .eq("mode", data.mode)
      .maybeSingle();
    if (existing && existing.score >= data.score) return { ok: true, updated: false };
    const { error } = await context.supabase
      .from("leaderboard_scores")
      .upsert({
        user_id: context.userId,
        mode: data.mode,
        score: data.score,
        display_name: data.display_name ?? null,
        equipped_skin: data.equipped_skin ?? null,
      }, { onConflict: "user_id,mode" });
    if (error) throw error;
    return { ok: true, updated: true };
  });

export const fetchLeaderboard = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ mode: ModeEnum }).parse(input))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { storage: undefined, persistSession: false, autoRefreshToken: false } },
    );
    const { data: rows, error } = await sb
      .from("leaderboard_scores")
      .select("user_id, mode, score, display_name, equipped_skin, updated_at")
      .eq("mode", data.mode)
      .order("score", { ascending: false })
      .limit(100);
    if (error) throw error;
    return rows ?? [];
  });

export const fetchMyRank = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ mode: ModeEnum }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: mine } = await context.supabase
      .from("leaderboard_scores")
      .select("score")
      .eq("user_id", context.userId)
      .eq("mode", data.mode)
      .maybeSingle();
    if (!mine) {
      const { count } = await context.supabase
        .from("leaderboard_scores")
        .select("*", { count: "exact", head: true })
        .eq("mode", data.mode);
      return { score: 0, rank: null as number | null, total: count ?? 0 };
    }
    const { count: better } = await context.supabase
      .from("leaderboard_scores")
      .select("*", { count: "exact", head: true })
      .eq("mode", data.mode)
      .gt("score", mine.score);
    const { count: total } = await context.supabase
      .from("leaderboard_scores")
      .select("*", { count: "exact", head: true })
      .eq("mode", data.mode);
    return { score: mine.score, rank: (better ?? 0) + 1, total: total ?? 0 };
  });
