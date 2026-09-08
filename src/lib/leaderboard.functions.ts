import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ModeEnum = z.enum(["classic", "hardcore", "zen", "blitz"]);

/** Envoie le meilleur score du joueur (garde uniquement le meilleur par mode). */
export const submitScore = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        mode: ModeEnum,
        score: z.number().int().min(0).max(10_000_000),
        display_name: z.string().max(40).nullable().optional(),
        equipped_skin: z.string().max(24).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing, error: existingError } = await context.supabase
      .from("leaderboard_scores")
      .select("id, score")
      .eq("user_id", context.userId)
      .eq("mode", data.mode)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing && existing.score >= data.score) {
      return { ok: true, updated: false };
    }

    const { error } = await context.supabase.from("leaderboard_scores").upsert(
      {
        user_id: context.userId,
        mode: data.mode,
        score: data.score,
        display_name: data.display_name ?? "Player",
        equipped_skin: data.equipped_skin ?? null,
      },
      { onConflict: "user_id,mode" },
    );
    if (error) throw error;

    return { ok: true, updated: true };
  });

/** Top 100 mondial — public, comptes et invités mélangés. */
export const fetchLeaderboard = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ mode: ModeEnum }).parse(input))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env["SUPABASE_URL"]!,
      process.env["SUPABASE_PUBLISHABLE_KEY"]!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const [accounts, guests] = await Promise.all([
      sb.from("leaderboard_scores")
        .select("user_id, mode, score, display_name, equipped_skin, updated_at")
        .eq("mode", data.mode).order("score", { ascending: false }).limit(100),
      sb.from("guest_scores")
        .select("mode, score, display_name, equipped_skin, updated_at")
        .eq("mode", data.mode).order("score", { ascending: false }).limit(100),
    ]);
    if (accounts.error) throw accounts.error;
    if (guests.error) throw guests.error;

    type Row = {
      user_id: string | null; mode: string; score: number;
      display_name: string | null; equipped_skin: string | null;
      updated_at: string | null; guest: boolean;
    };
    const rows: Row[] = [
      ...(accounts.data ?? []).map((r) => ({ ...r, guest: false }) as Row),
      // L'identifiant d'appareil n'est jamais exposé publiquement.
      ...(guests.data ?? []).map((r) => ({ ...r, user_id: null, guest: true }) as Row),
    ];
    rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    return rows.slice(0, 100);
  });

/** Classement personnel du joueur connecté. */
export const fetchMyRank = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ mode: ModeEnum }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: mine, error } = await context.supabase
      .from("leaderboard_scores")
      .select("score")
      .eq("user_id", context.userId)
      .eq("mode", data.mode)
      .maybeSingle();
    if (error) throw error;

    const { count: total } = await context.supabase
      .from("leaderboard_scores")
      .select("*", { count: "exact", head: true })
      .eq("mode", data.mode);

    if (!mine) {
      return { score: 0, rank: null as number | null, total: total ?? 0 };
    }

    const { count: better } = await context.supabase
      .from("leaderboard_scores")
      .select("*", { count: "exact", head: true })
      .eq("mode", data.mode)
      .gt("score", mine.score);

    return { score: mine.score, rank: (better ?? 0) + 1, total: total ?? 0 };
  });

/** Meilleurs scores du joueur dans TOUS les modes, tels qu'enregistrés au classement. */
export const fetchMyBests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("leaderboard_scores")
      .select("mode, score")
      .eq("user_id", context.userId);
    if (error) throw error;
    const out: Record<string, number> = {};
    for (const r of data ?? []) out[r.mode] = Math.max(out[r.mode] ?? 0, r.score ?? 0);
    return out;
  });

