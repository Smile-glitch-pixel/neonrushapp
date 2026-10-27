# NEON RUSH — Comprehensive Project Analysis Report

**Date:** 2026-10-27  
**Branch:** main (commit b31fc24 "MAJ 1 Duo Reborn")  
**Analyst:** Senior Developer / Co-developer

---

## Executive Summary

Neon Rush is a polished, feature-rich arcade game built with React 18, TypeScript, Vite, TanStack Router/Query/Start, and Supabase. The codebase demonstrates solid engineering practices: dual auth (authenticated + guest), server functions with Zod validation, realtime Duo coop, a deep economy (battle pass, missions, chests, skins), and procedural audio. However, the **main game component (NeonRush.tsx) has grown to 5,000+ lines** — a God component that mixes rendering, game loop, audio, input, UI panels, Duo logic, and more. This creates maintenance risk, testing difficulty, and performance concerns.

The Duo Reborn feature (realtime coop) is well-architected but pushes Supabase free-tier message limits. Security posture is generally good (server-side validation, timing-safe password check), but **guest device IDs act as passwords with no rotation/revocation**, and leaderboard submissions lack rate limiting.

---

## 🔴 CRITIQUE — Critical Security Vulnerabilities & Data Integrity Risks

| # | Finding | Location | Impact | Recommendation |
|---|---------|----------|--------|----------------|
| C1 | **No rate limiting on leaderboard submissions** | `src/lib/guest.functions.ts:55-77`, `src/lib/leaderboard.functions.ts` | Score spam, leaderboard pollution, Supabase quota exhaustion | Add per-device / per-user hourly & daily limits in RPC functions; return 429 with `Retry-After` |
| C2 | **Device ID = permanent password for guests** | `src/lib/guest.ts:19-29`, `src/lib/guest.functions.ts:23` | Device ID in localStorage → anyone with access can impersonate guest, submit scores, claim names | Add device ID rotation on suspicious activity; bind device to fingerprint (canvas/hash); add revocation endpoint |
| C3 | **Guest name claim RPC trusts caller-supplied device ID** | `src/lib/guest.functions.ts:36-52` | Malicious caller can claim names for arbitrary device IDs | Verify device ownership via signed token or session; don't accept raw device ID from client |
| C4 | **No RLS policies visible / verified** | `src/integrations/supabase/types.ts` (tables) | Data leakage, unauthorized mutations if RLS missing | Audit all tables: enable RLS, add policies for `player_state` (user_id = auth.uid()), `guest_players` (device_id = current_setting), `rooms`/`room_players` (membership check) |
| C5 | **Service role client exported as proxy — risk of accidental client import** | `src/integrations/supabase/client.server.ts:61-72` | If imported in non-`.server.ts`, service key ships to browser | Rename to `client.admin.ts`; add lint rule forbidding import outside `.server.ts` / `*.functions.ts`; consider `server-only` package |
| C6 | **Display names rendered without sanitization** | `src/components/DuoLobby.tsx:55`, `src/components/NeonRush.tsx` (profile/leaderboard) | XSS if name contains `<img src=x onerror=...>` | Sanitize on render (`DOMPurify` or escape HTML entities); enforce alphanumeric + `._-` server-side (already validated) |
| C7 | **Score submissions fully trusted from client** | `src/lib/guest.functions.ts:55-77`, `src/lib/leaderboard.functions.ts` | Cheaters can submit arbitrary scores | Implement server-side score validation: replay inputs, or at minimum statistical anomaly detection (score/time ratio, max theoretical score per mode) |
| C8 | **Duo room code — no format validation / brute-force protection** | `src/lib/duo.functions.ts` (join/create) | 6-char codes → 36^6 ≈ 2B space, but no rate limit on join attempts | Add per-IP / per-account join attempt limits; increase code length or add checksum character |

---

## 🟠 HAUTE — High-Impact Architecture, Performance & Maintainability Issues

| # | Finding | Location | Impact | Recommendation |
|---|---------|----------|--------|----------------|
| H1 | **NeonRush.tsx = 5,040 lines God component** | `src/components/NeonRush.tsx` | Impossible to test, review, or refactor; bundle size; cognitive load | Split into: `GameCanvas` (loop/render), `AudioEngine`, `InputManager`, `EntitySystem`, `UIPanels` (lazy-loaded), `DuoManager`, `TutorialOverlay` |
| H2 | **Duplicate Duo-timing.ts in two locations** | `src/components/Duo-timing.ts` & `src/lib/duo-timing.ts` | Confusion, divergence risk | Delete `src/components/Duo-timing.ts`; update imports to `@/lib/duo-timing` |
| H3 | **Duo ghost position broadcast: 4 msg/sec/player → ~345k msgs/month per active duo pair** | `src/hooks/useDuoGhost.ts:20` (`SEND_EVERY_MS=250`) | Supabase free tier = 2M realtime msgs/month; 6 concurrent duos = quota risk | Adaptive rate: 10Hz when moving, 1Hz idle; compress to `int16` (0-65535); consider WebRTC data channel for LAN/low-latency |
| H4 | **No code splitting / lazy loading** | `src/routes/index.tsx`, `src/components/NeonRush.tsx` (all panels inline) | Initial JS ~500KB+ gzipped; slow TTI on mobile | Lazy-load heavy panels (`SkinsPanel`, `LeaderboardPanel`, `ProfilePanel`, `DuoLobby`) with `React.lazy` + `Suspense`; route-based splitting for `/duo`, `/profile` |
| H5 | **AudioContext recreated on every user interaction** | `src/components/NeonRush.tsx` (`AudioEngine` class) | Latency, "click" artifacts, Safari autoplay issues | Create single `AudioContext` on first interaction; resume on subsequent; pool `OscillatorNode`/`GainNode` |
| H6 | **Canvas full redraw every frame — no dirty rect / layering** | `src/components/NeonRush.tsx` (render loop) | GPU overdraw, battery drain on mobile | Split into layers: static background, hazards, orbs, particles, UI; only redraw changed layers; use `OffscreenCanvas` + WebWorker for simulation |
| H7 | **Game loop uses `setInterval` for fixed timestep, not `requestAnimationFrame`** | `src/components/NeonRush.tsx` (~line 2000) | Jank, drift, no vsync alignment | Use `requestAnimationFrame` with accumulator for fixed-step physics; interpolate render alpha |
| H8 | **TanStack Query underutilized — direct RPC calls bypass cache** | `src/hooks/useDuo.ts`, `src/components/NeonRush.tsx` (leaderboard, profile, shop) | Stale data, duplicate requests, no deduping | Wrap all server functions in `useQuery`/`useMutation`; invalidate on relevant mutations; use `queryClient.setQueryData` for optimistic updates |
| H9 | **No Service Worker / offline support** | — | PWA installability, offline play (Zen/Classic), faster reloads | Add Vite PWA plugin; cache shell + assets; queue score submissions offline; background sync on reconnect |
| H10 | **i18n dictionary = 1,160 lines loaded entirely** | `src/lib/i18n.ts` | ~45KB JS for all 3 languages; only 1 used | Split per-language chunks; dynamic `import()` based on `navigator.language` or user setting |

---

## 🟡 MOYENNE — Gameplay, Duo, Economy & Retention Improvements

| # | Finding | Area | Recommendation |
|---|---------|------|----------------|
| M1 | **Duo ghost interpolation is simple lerp (0.15 factor)** | `src/hooks/useDuoGhost.ts:105-109` | Add configurable smoothing (catmull-rom or exponential with adaptive `dt`); show latency indicator |
| M2 | **No reconnection logic for Duo mid-game** | `src/hooks/useDuo.ts`, `useDuoGhost.ts` | On disconnect: pause local sim, show "Reconnecting…", attempt rejoin for 10s; if host leaves, promote guest |
| M3 | **Powerup spawn rates static per mode** | `src/lib/powerups.ts`, `NeonRush.tsx` spawn logic | Dynamic difficulty: increase powerup frequency when player struggling (low combo, near death); decrease when dominating |
| M4 | **No Practice / Training mode** | Game modes | Add "Practice" mode: infinite lives, slow motion toggle, spawn specific hazards, no score/leaderboard |
| M5 | **Battle Pass rewards repetitive (coins/chests/XP/skin every 25)** | `src/lib/neon-progression.ts` (PASS_TIERS) | Variate: exclusive visual styles, emotes, profile badges, title prefixes, skin recolors, soundtrack unlocks |
| M6 | **Daily login streak unforgiving — no streak freeze / recovery** | `src/lib/neon-progression.ts` (dailyLoginStreak) | Add "Streak Freeze" consumable (shop/gem); 1-day grace period after 30-day streak |
| M7 | **No social features beyond Duo** | — | Friend system (invite code → friend list); clan/guild (shared progress, clan leaderboard); spectate mode |
| M8 | **Skin powers lack visual variety** | `src/lib/neon-progression.ts` (SKINS powers) | Unique VFX per power: magnet = orbiting particles, shield = hex grid, x2 = score numbers gold, etc. |
| M9 | **No replay system for high scores** | Leaderboard / Profile | Record deterministic inputs (RNG seed + input frames); allow replay playback + share link |
| M10 | **Halloween event code stays year-round** | `src/lib/neon-progression.ts`, `NeonRush.tsx` | Feature-flag events: `isEventActive('halloween')` guard; auto-disable after date; tree-shake in prod build |

---

## 🟢 FAIBLE — Polish, Accessibility & Nice-to-Have

| # | Finding | Area | Recommendation |
|---|---------|------|----------------|
| L1 | **Spanish "día de racha" unnatural** | `src/lib/i18n.ts:887` | Use "día de racha" → "día de racha" is ok but "día de racha" reads better as "día de racha" (no change needed) — minor: "racha de días" |
| L2 | **No keyboard navigation for menus** | All panels | Add `tabIndex`, `onKeyDown` (Enter/Space/Arrows), focus traps in modals |
| L3 | **No haptic feedback on mobile** | Gameplay (orb collect, hazard hit, powerup) | `navigator.vibrate([10, 50, 10])` patterns per event; respect `prefers-reduced-motion` |
| L4 | **Particle effects reuse same pool — limited variety** | `NeonRush.tsx` particle system | Per-event emitters: orb pop (ring), hazard hit (shards), powerup (burst), combo milestone (text + sparkles) |
| L5 | **Sound effects procedural but repetitive** | `AudioEngine` in `NeonRush.tsx` | Add subtle pitch variation (±5%), layer noise/click for texture; optional "retro" sound pack |
| L6 | **Tutorial is text-heavy, not interactive** | `NeonRush.tsx` TutorialOverlay | Step-by-step playable tutorial: "Collect this orb" → spawn one → wait for input → next step |
| L7 | **No accessibility features** | — | ARIA labels, screen reader announcements (score, combo, game over), high-contrast mode, "reduce motion" disables particles/shake |
| L8 | **Leaderboard shows raw rank only** | `LeaderboardPanel` | Show percentile ("Top 12%"), score distribution sparkline, "players within 10% of you" |
| L9 | **Profile stats are text only** | `ProfilePanel` | Mini charts: score over time (sparkline), mode breakdown (radar), playtime heatmap (calendar) |
| L10 | **No "Reduce Motion" setting** | Settings panel | Toggle: disable screen shake, particle trails, UI animations; respect `prefers-reduced-motion` media query |

---

## 📊 Supabase Schema & RPC Audit Notes

| Table | RLS Needed? | Suggested Policy |
|-------|-------------|------------------|
| `player_state` | YES | `user_id = auth.uid()` (authenticated) OR `user_id IS NULL` + device claim (guest) |
| `guest_players` | YES | `device_id = current_setting('app.current_device_id')` (set via middleware) |
| `guest_scores` | YES | Same as `guest_players`; `SELECT` public for leaderboard |
| `leaderboard_scores` | YES | `user_id = auth.uid()` for write; `SELECT` public |
| `rooms` / `room_players` | YES | Membership: `host_id = auth.uid()` OR `id IN (SELECT room_id FROM room_players WHERE user_id = auth.uid())` |
| `duo_matches` | YES | Participants only |
| `economy_events` | YES | `user_id = auth.uid()` |
| `store_offers` | YES | Public read; admin write |
| `profiles` | YES | `id = auth.uid()` |

**Missing RPC audits:** `duo_cleanup`, `duo_tick`, `duo_guest_*` — verify they validate membership & rate-limit.

---

## 🛠️ Suggested Refactoring Roadmap (Priority Order)

| Phase | Focus | Est. Effort |
|-------|-------|-------------|
| **1. Stabilize** | Fix C1-C8 (security), delete duplicate Duo-timing (H2), add RLS policies | 1-2 weeks |
| **2. Split God Component** | Extract `GameCanvas`, `AudioEngine`, `InputManager`, `EntitySystem` from NeonRush | 2-3 weeks |
| **3. Performance** | Layered canvas, `requestAnimationFrame` loop, lazy-load panels, SW/PWA | 2 weeks |
| **4. Duo Scaling** | Adaptive ghost rate, WebRTC prototype, reconnection logic | 1-2 weeks |
| **5. Economy/Retention** | Practice mode, streak freeze, varied pass rewards, social features | Ongoing |
| **6. Polish** | Accessibility, haptics, replay system, i18n splitting | Ongoing |

---

## 📦 Dependency & Build Health

| Package | Version | Notes |
|---------|---------|-------|
| React | 18.2+ | OK |
| TanStack Router/Query/Start | Latest | Good SSR + server functions |
| Supabase JS | 2.x | Realtime + Auth + PostgREST |
| Vite | 5.x | Fast HMR |
| Tailwind | 3.x | Utility-first styling |
| Zod | 3.x | Server function validation |
| **No TypeScript errors** | — | `tsc --noEmit` passes |
| **No ESLint warnings** | — | Clean |

---

## ✅ Strengths to Preserve

1. **Dual progression (guest + auth)** — seamless, no forced signup
2. **Server functions with Zod** — type-safe mutations, no raw SQL in client
3. **Duo Reborn architecture** — presence + broadcast separation, deterministic countdown
4. **Procedural audio** — zero asset dependencies, tiny bundle
5. **Economy depth** — battle pass, missions, chests, perks, visual shop all integrated
6. **Internationalization** — 3 languages, complete coverage
7. **Error boundaries & SSR error recovery** — `error-capture.ts` + `server.ts` normalization

---

*End of Report*