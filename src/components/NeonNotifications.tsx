import type { Notif } from "@/hooks/useNotifications";

const KIND_STYLE: Record<Notif["kind"], { border: string; text: string; glow: string }> = {
  info: { border: "border-[color:var(--neon-cyan)]/50", text: "text-glow-cyan", glow: "0 0 24px -6px var(--neon-cyan)" },
  success: { border: "border-[color:var(--neon-cyan)]/70", text: "text-glow-cyan", glow: "0 0 30px -4px var(--neon-cyan)" },
  warn: { border: "border-[color:var(--neon-magenta)]/70", text: "text-glow-magenta", glow: "0 0 30px -4px var(--neon-magenta)" },
  error: { border: "border-[color:var(--neon-magenta)]", text: "text-glow-magenta", glow: "0 0 34px -4px var(--neon-magenta)" },
  epic: { border: "border-[color:var(--neon-yellow,#fff17a)]", text: "text-glow-yellow", glow: "0 0 44px -2px #fff17a" },
};

/** Pile de notifications animées, jamais bloquante pour le gameplay. */
export default function NeonNotifications({ list, onDismiss }: { list: Notif[]; onDismiss: (id: number) => void }) {
  if (list.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-20 z-40 flex flex-col items-center gap-2 px-3">
      {list.map((n) => {
        const st = KIND_STYLE[n.kind];
        return (
          <button
            key={n.id}
            onClick={() => onDismiss(n.id)}
            style={{ boxShadow: st.glow, ...(n.color ? { color: n.color, textShadow: `0 0 12px ${n.color}` } : {}) }}
            className={`notif-pop pointer-events-auto max-w-[92vw] rounded-full border bg-black/70 px-5 py-2 text-center text-[11px] font-black uppercase tracking-[0.22em] backdrop-blur-md ${st.border} ${n.color ? "" : st.text} ${n.kind === "epic" ? "notif-epic" : ""}`}
          >
            {n.icon ? `${n.icon} ` : ""}{n.text}
          </button>
        );
      })}
    </div>
  );
}
