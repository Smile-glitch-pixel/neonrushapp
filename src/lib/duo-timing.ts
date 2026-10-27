/**
 * NEON RUSH — Minutage partagé du départ Duo.
 *
 * Problème corrigé : l'hôte démarrait tout de suite, alors que l'invité
 * découvrait que la partie était lancée jusqu'à ~2 s plus tard (sondage réseau).
 *
 * Solution : un petit compte à rebours commun, calé sur l'heure de départ du
 * serveur (started_at). Il laisse le temps à l'invité de recevoir l'information,
 * et les deux joueurs voient le même écran et partent au même instant.
 */

/** Durée du compte à rebours commun avant le départ (en millisecondes). */
export const DUO_LEAD_IN_MS = 3000;

/**
 * Temps restant avant le « GO », en millisecondes (0 = c'est parti).
 * Plafonné pour qu'une horloge d'appareil très en retard ne bloque jamais le jeu.
 */
export function duoMsUntilGo(startedAt: string | null, now: number = Date.now()): number {
  if (!startedAt) return 0;
  const t = Date.parse(startedAt);
  if (Number.isNaN(t)) return 0;
  return Math.min(Math.max(t + DUO_LEAD_IN_MS - now, 0), DUO_LEAD_IN_MS + 1000);
}