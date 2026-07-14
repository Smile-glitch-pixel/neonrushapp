import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ModeEnum = z.enum(["classic", "hardcore", "zen", "blitz"]);

/**
 * Envoie le meilleur score du joueur
 */
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

    const { data: existing, error: existingError } = await context.supabase
      .from("leaderboard_scores")
      .select("id, score")
      .eq("user_id", context.userId)
      .eq("mode", data.mode)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    // On garde uniquement le meilleur score
    if (existing && existing.score >= data.score) {
      return {
        ok: true,
        updated: false,
      };
    }

    const { error } = await context.supabase
      .from("leaderboard_scores")
      .upsert(
        {
          user_id: context.userId,
          mode: data.mode,
          score: data.score,
          display_name: data.display_name ?? "Player",
          equipped_skin: data.equipped_skin ?? null,
        },
        {
          onConflict: "user_id,mode",
        },
      );

    if (error) {
      throw error;
    }

    return {
      ok: true,
      updated: true,
    };
  });


/**
 * Récupère le Top 100
 */
export const fetchLeaderboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      mode: ModeEnum,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {

    const { data: rows, error } = await context.supabase
      .from("leaderboard_scores")
      .select(
        "user_id, mode, score, display_name, equipped_skin, updated_at",
      )
      .eq("mode", data.mode)
      .order("score", {
        ascending: false,
      })
      .limit(100);


    if (error) {
      throw error;
    }

    return rows ?? [];
  });


/**
 * Trouve le classement du joueur connecté
 */
export const fetchMyRank = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({
      mode: ModeEnum,
    }).parse(input),
  )
  .handler(async ({ data, context }) => {

    const { data: mine, error } = await context.supabase
      .from("leaderboard_scores")
      .select("score")
      .eq("user_id", context.userId)
      .eq("mode", data.mode)
      .maybeSingle();


    if (error) {
      throw error;
    }


    // Aucun score
    if (!mine) {

      const { count } = await context.supabase
        .from("leaderboard_scores")
        .select("*", {
          count: "exact",
          head: true,
        })
        .eq("mode", data.mode);


      return {
        score: 0,
        rank: null,
        total: count ?? 0,
      };
    }


    // Nombre de joueurs devant lui
    const { count: better } = await context.supabase
      .from("leaderboard_scores")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("mode", data.mode)
      .gt("score", mine.score);



    const { count: total } = await context.supabase
      .from("leaderboard_scores")
      .select("*", {
        count: "exact",
        head: true,
      })
      .eq("mode", data.mode);



    return {
      score: mine.score,
      rank: (better ?? 0) + 1,
      total: total ?? 0,
    };
  });
