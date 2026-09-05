import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Pseudo : 3-20 caractères, lettres/chiffres/._- */
export const NAME_RE = /^[A-Za-z0-9._-]{3,20}$/;

/** Pseudo actuel du joueur connecté (null s'il n'en a pas encore). */
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("id, display_name")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;
    return { display_name: data?.display_name ?? null };
  });

/** Vérifie la disponibilité d'un pseudo (insensible à la casse). */
export const checkDisplayName = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ name: z.string().min(1).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const name = data.name.trim();
    if (!NAME_RE.test(name)) return { ok: false, reason: "INVALID" as const };
    const { data: available, error } = await context.supabase.rpc("display_name_available", { _name: name });
    if (error) throw error;
    return available ? { ok: true as const } : { ok: false, reason: "TAKEN" as const };
  });

/** Enregistre le pseudo (unique) et le propage au classement. */
export const setDisplayName = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ name: z.string().min(1).max(40) }).parse(input))
  .handler(async ({ data, context }) => {
    const name = data.name.trim();
    if (!NAME_RE.test(name)) return { ok: false as const, reason: "INVALID" as const };

    const { data: available, error: availErr } = await context.supabase.rpc("display_name_available", { _name: name });
    if (availErr) throw availErr;
    if (!available) return { ok: false as const, reason: "TAKEN" as const };

    const { error } = await context.supabase
      .from("profiles")
      .upsert({ id: context.userId, display_name: name }, { onConflict: "id" });
    if (error) {
      if ((error as { code?: string }).code === "23505" || /duplicate|unique/i.test(error.message)) {
        return { ok: false as const, reason: "TAKEN" as const };
      }
      throw error;
    }

    await context.supabase
      .from("leaderboard_scores")
      .update({ display_name: name })
      .eq("user_id", context.userId);

    return { ok: true as const, name };
  });
