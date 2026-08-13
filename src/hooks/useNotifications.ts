import { useCallback, useEffect, useRef, useState } from "react";

export type NotifKind = "info" | "success" | "warn" | "error" | "epic";

export type Notif = {
  id: number;
  text: string;
  icon?: string;
  kind: NotifKind;
  color?: string;
  /** ms; 0 = persistant jusqu'à dismiss() */
  ttl: number;
};

const DEFAULT_TTL: Record<NotifKind, number> = {
  info: 2000,
  success: 2400,
  warn: 2600,
  error: 3200,
  epic: 3600,
};

/**
 * File de notifications non bloquante (max 4 visibles, auto-dismiss, timers nettoyés).
 */
export function useNotifications(max = 4) {
  const [list, setList] = useState<Notif[]>([]);
  const idRef = useRef(1);
  const timers = useRef<Set<number>>(new Set());

  const dismiss = useCallback((id: number) => {
    setList((l) => l.filter((n) => n.id !== id));
  }, []);

  const notify = useCallback(
    (text: string, opts?: { kind?: NotifKind; icon?: string; color?: string; ttl?: number }) => {
      const kind = opts?.kind ?? "info";
      const id = idRef.current++;
      const ttl = opts?.ttl ?? DEFAULT_TTL[kind];
      setList((l) => [...l.slice(-(max - 1)), { id, text, kind, ttl, ...(opts?.icon ? { icon: opts.icon } : {}), ...(opts?.color ? { color: opts.color } : {}) }]);
      if (ttl > 0) {
        const t = window.setTimeout(() => { timers.current.delete(t); dismiss(id); }, ttl);
        timers.current.add(t);
      }
      return id;
    },
    [dismiss, max],
  );

  const clear = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current.clear();
    setList([]);
  }, []);

  useEffect(() => () => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current.clear(); }, []);

  return { list, notify, dismiss, clear };
}
