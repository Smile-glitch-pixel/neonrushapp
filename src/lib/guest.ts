/**
 * Identité « invité » : un identifiant d'appareil stable, généré une fois et
 * conservé localement. Il sert à réserver un pseudo à vie (empêche de libérer
 * un pseudo en vidant ses données) et à limiter les envois de score par heure.
 * Il n'est jamais exposé dans le classement public.
 */
const KEY = "neonrush.device";

const rnd = () => {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID().replace(/-/g, "");
  } catch { /* noop */ }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`;
};

export function getDeviceId(): string {
  try {
    const cur = window.localStorage.getItem(KEY);
    if (cur && cur.length >= 16 && cur.length <= 64) return cur;
    const id = `${rnd()}${rnd()}`.slice(0, 48);
    window.localStorage.setItem(KEY, id);
    return id;
  } catch {
    return `${rnd()}${rnd()}`.slice(0, 48);
  }
}
