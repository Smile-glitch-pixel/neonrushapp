/**
 * Petit rond rouge de notification, façon application mobile.
 * `count` = 0 → simple point ; sinon chiffre (99+ au-delà).
 */
export default function NotifBadge({ count = 0, className = "" }: { count?: number; className?: string }) {
  const label = count > 99 ? "99+" : count > 0 ? String(count) : "";
  return (
    <span
      aria-hidden="true"
      className={`pointer-events-none absolute -right-1 -top-1 z-10 grid place-items-center rounded-full bg-[#ff2d55] font-display font-black leading-none text-white animate-[notif-pop_0.35s_ease-out] ${
        label ? "min-w-[18px] px-1 py-[2px] text-[10px]" : "h-[10px] w-[10px]"
      } ${className}`}
      style={{ boxShadow: "0 0 10px rgba(255,45,85,0.9), 0 0 2px rgba(0,0,0,0.6)" }}
    >
      {label}
    </span>
  );
}
