import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * Badge de notification générique (petit rond rouge).
 *
 * Principe : chaque source déclare une « signature » de ce qu'il y a à voir.
 * Tant que la signature vue par le joueur diffère de la signature courante,
 * le badge est affiché. Ouvrir l'onglet enregistre la signature → badge éteint.
 * Réutilisable pour n'importe quel onglet actuel ou futur : il suffit d'ajouter
 * une entrée dans l'objet `signals`.
 */
export type BadgeSignal = { sig: string; count?: number } | null;

const STORE = "neonrush.badges";

export function useBadges(scope: string | null, signals: Record<string, BadgeSignal>) {
  const storeKey = `${STORE}:${scope ?? "device"}`;
  const [seen, setSeen] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setReady(false);
    try {
      const raw = window.localStorage.getItem(storeKey);
      setSeen(raw ? (JSON.parse(raw) as Record<string, string>) : {});
    } catch {
      setSeen({});
    }
    setReady(true);
  }, [storeKey]);

  const persist = useCallback((next: Record<string, string>) => {
    setSeen(next);
    try { window.localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* noop */ }
  }, [storeKey]);

  /** Badge à afficher pour cette clé (null = rien à signaler). */
  const badge = useCallback((key: string): { count: number } | null => {
    if (!ready) return null;
    const s = signals[key];
    if (!s || !s.sig) return null;
    if (seen[key] === s.sig) return null;
    return { count: s.count ?? 0 };
  }, [ready, seen, signals]);

  /** Le joueur a consulté cet onglet : on éteint le badge. */
  const markSeen = useCallback((key: string) => {
    const s = signals[key];
    const sig = s?.sig ?? "";
    setSeen((prev) => {
      if (prev[key] === sig) return prev;
      const next = { ...prev, [key]: sig };
      try { window.localStorage.setItem(storeKey, JSON.stringify(next)); } catch { /* noop */ }
      return next;
    });
  }, [signals, storeKey]);

  const anyBadge = useMemo(
    () => Object.keys(signals).some((k) => badge(k) !== null),
    [signals, badge],
  );

  return { badge, markSeen, anyBadge, persist };
}
