import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Client public serveur (invités non connectés). */
const publicClient = async () => {
  const { createClient } = await import("@supabase/supabase-js");
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  return createClient(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input as string, { ...init, headers: h });
      },
    },
  });
};

const DeviceSchema = z.string().min(16).max(64);

/** Réserve un pseudo pour cet appareil (unique parmi comptes ET invités). */
export const guestClaimName = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({ deviceId: DeviceSchema, name: z.string().min(1).max(40) }).parse(i))
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const { data: res, error } = await sb.rpc("guest_claim_name", {
      _device: data.deviceId,
      _name: data.name.trim(),
    });
    if (error) throw error;
    const status = String(res ?? "INVALID");
    if (status === "OK") return { ok: true as const, name: data.name.trim() };
    return { ok: false as const, reason: status === "TAKEN" ? ("TAKEN" as const) : ("INVALID" as const) };
  });

/** Enregistre le score d'un invité au classement mondial (contrôles serveur). */
export const guestSubmitScore = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) =>
    z.object({
      deviceId: DeviceSchema,
      mode: z.enum(["classic", "hardcore", "blitz"]),
      score: z.number().int().min(0).max(5_000_000),
      skin: z.string().max(24).nullable().optional(),
    }).parse(i))
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const { data: res, error } = await sb.rpc("guest_submit_score", {
      _device: data.deviceId,
      _mode: data.mode,
      _score: data.score,
      _skin: data.skin ?? null,
    });
    if (error) throw error;
    return { ok: Boolean(res) };
  });

/** Meilleurs scores de cet appareil invité, par mode. */
export const guestBests = createServerFn({ method: "POST" })
  .inputValidator((i: unknown) => z.object({ deviceId: DeviceSchema }).parse(i))
  .handler(async ({ data }) => {
    const sb = await publicClient();
    const { data: rows, error } = await sb
      .from("guest_scores").select("mode, score").eq("device_id", data.deviceId);
    if (error) throw error;
    const out: Record<string, number> = {};
    for (const r of rows ?? []) out[r.mode as string] = Math.max(out[r.mode as string] ?? 0, (r.score as number) ?? 0);
    return out;
  });
