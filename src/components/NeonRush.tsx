import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LANGS, type Lang, t } from "@/lib/i18n";
import {
  MODES, SKINS, PASS_TIERS, PASS_XP_PER_TIER, PASS_REWARDS, REWARD_MULT, rankFor,
  loadProg, saveProg, defaultProg, refreshMissionsIfNeeded, findTemplate,
  RARITY_FX, RARITY_COLOR, rollChestReward, CHEST_COST,
  type GameMode, type Progression, type SkinId, type MissionStat, type Rarity,
} from "@/lib/neon-progression";
import { supabase } from "@/integrations/supabase/client";
import { pullPlayerState, pushPlayerState } from "@/lib/player-sync.functions";
import { useDuo } from "@/hooks/useDuo";
import DuoLobby from "@/components/DuoLobby";
import { mergeProg, progToRemote } from "@/lib/prog-sync";
import { submitScore, fetchLeaderboard, fetchMyRank } from "@/lib/leaderboard.functions";
import { POWERS, POWER_MAP, POWER_IDS, rollPower, emptyTimers, type PowerId, type PowerTimers } from "@/lib/powerups";
import { useNotifications } from "@/hooks/useNotifications";
import NeonNotifications from "@/components/NeonNotifications";

/* ----------------------------- Audio Engine ----------------------------- */
class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  started = false;
  muted = false;
  private musicTimer: number | null = null;
  private step = 0;

  ensure() {
    if (this.ctx) return;
    const AC =
      (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.master);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.master);
  }
  async start() {
    this.ensure();
    if (!this.ctx) return;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.started) { this.started = true; this.scheduleMusic(); }
  }
  setMuted(m: boolean) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : 0.7; }
  private scheduleMusic() {
    if (!this.ctx || !this.musicGain) return;
    const scale = [0, 3, 5, 7, 10, 12, 15];
    const root = 55;
    const tick = () => {
      if (!this.ctx || !this.musicGain) return;
      const tt = this.ctx.currentTime;
      this.playTone({ freq: root * Math.pow(2, scale[this.step % scale.length] / 12) / 2, dur: 0.28, type: "sawtooth", gain: 0.25, dest: this.musicGain, at: tt, filter: 500 });
      if (this.step % 2 === 0) {
        const n = scale[(this.step * 3 + 2) % scale.length];
        this.playTone({ freq: root * 4 * Math.pow(2, n / 12), dur: 0.18, type: "triangle", gain: 0.08, dest: this.musicGain, at: tt + 0.06 });
      }
      this.noiseHit(0.03, 0.04, this.musicGain, tt + 0.12);
      this.step++;
    };
    tick();
    this.musicTimer = window.setInterval(tick, 260);
  }
  private playTone(o: { freq: number; dur: number; type?: OscillatorType; gain?: number; dest?: AudioNode; at?: number; filter?: number; slideTo?: number; }) {
    if (!this.ctx) return;
    const tt = o.at ?? this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.freq, tt);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), tt + o.dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, tt);
    g.gain.linearRampToValueAtTime(o.gain ?? 0.2, tt + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, tt + o.dur);
    if (o.filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = o.filter;
      osc.connect(f); f.connect(g);
    } else { osc.connect(g); }
    g.connect(o.dest ?? this.sfxGain ?? this.master!);
    osc.start(tt); osc.stop(tt + o.dur + 0.02);
  }
  private noiseHit(dur: number, gain: number, dest: AudioNode, at?: number) {
    if (!this.ctx) return;
    const tt = at ?? this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource(); src.buffer = buffer;
    const hp = this.ctx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 6000;
    const g = this.ctx.createGain(); g.gain.value = gain;
    src.connect(hp); hp.connect(g); g.connect(dest); src.start(tt);
  }
  pickup(combo: number) {
    if (!this.ctx) return;
    const base = 660 + Math.min(combo, 20) * 40;
    this.playTone({ freq: base, dur: 0.12, type: "triangle", gain: 0.25 });
    this.playTone({ freq: base * 1.5, dur: 0.14, type: "sine", gain: 0.18, at: this.ctx.currentTime + 0.02 });
  }
  power() {
    if (!this.ctx) return;
    const tt = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) this.playTone({ freq: 300 + i * 180, dur: 0.09, type: "square", gain: 0.15, at: tt + i * 0.04 });
  }
  legendarySound() {
    if (!this.ctx) return;
    const tt = this.ctx.currentTime;
    // Rising majestic arpeggio + sparkle
    const notes = [261, 329, 392, 523, 659, 784, 1046];
    notes.forEach((f, i) => {
      this.playTone({ freq: f, dur: 0.35, type: "triangle", gain: 0.28, at: tt + i * 0.07 });
      this.playTone({ freq: f * 2, dur: 0.25, type: "sine", gain: 0.15, at: tt + i * 0.07 + 0.02 });
    });
    this.noiseHit(0.4, 0.18, this.sfxGain ?? this.master!, tt + 0.5);
  }
  mythicSound() {
    if (!this.ctx) return;
    const tt = this.ctx.currentTime;
    // Deep boom + shimmering ascending pad + bell
    this.playTone({ freq: 55, dur: 1.2, type: "sawtooth", gain: 0.5, at: tt, filter: 400 });
    this.playTone({ freq: 82, dur: 1.2, type: "square", gain: 0.3, at: tt, filter: 500 });
    const notes = [523, 659, 784, 1046, 1318, 1568, 2093];
    notes.forEach((f, i) => {
      this.playTone({ freq: f, dur: 0.6, type: "sine", gain: 0.22, at: tt + 0.15 + i * 0.09 });
      this.playTone({ freq: f * 1.5, dur: 0.4, type: "triangle", gain: 0.12, at: tt + 0.2 + i * 0.09 });
    });
    // Bell hits
    [0.1, 0.55, 1.0].forEach((d) => {
      this.playTone({ freq: 1568, dur: 0.5, type: "sine", gain: 0.35, at: tt + d });
      this.playTone({ freq: 2093, dur: 0.5, type: "sine", gain: 0.25, at: tt + d });
    });
    this.noiseHit(0.8, 0.25, this.sfxGain ?? this.master!, tt + 0.05);
  }
  hit() {
    if (!this.ctx) return;
    this.playTone({ freq: 220, dur: 0.35, type: "sawtooth", gain: 0.35, slideTo: 55, filter: 900 });
    this.noiseHit(0.25, 0.4, this.sfxGain ?? this.master!);
  }
  gameover() {
    if (!this.ctx) return;
    const tt = this.ctx.currentTime;
    [440, 330, 262, 196].forEach((f, i) => this.playTone({ freq: f, dur: 0.35, type: "sawtooth", gain: 0.25, at: tt + i * 0.12 }));
  }
  /** Power-up spécifique : timbre différent selon l'identité */
  powerUp(id: string) {
    if (!this.ctx) return;
    const tt = this.ctx.currentTime;
    const map: Record<string, number[]> = {
      shield: [392, 523, 659],
      slow: [659, 523, 392, 330],
      x2: [523, 659, 784, 1046],
      magnet: [440, 554, 660],
      boost: [330, 494, 740, 988],
      second: [262, 392, 523, 784, 1046],
    };
    (map[id] ?? [440, 660]).forEach((f, i) =>
      this.playTone({ freq: f, dur: 0.16, type: id === "boost" ? "square" : "triangle", gain: 0.22, at: tt + i * 0.05 }),
    );
  }
  /** Fin d'un effet : descente courte */
  expire() {
    if (!this.ctx) return;
    const tt = this.ctx.currentTime;
    this.playTone({ freq: 520, dur: 0.22, type: "sine", gain: 0.16, at: tt, slideTo: 180 });
  }
  countBeep(last: boolean) {
    if (!this.ctx) return;
    this.playTone({ freq: last ? 880 : 520, dur: last ? 0.35 : 0.14, type: "square", gain: 0.22 });
  }
  record() {
    if (!this.ctx) return;
    const tt = this.ctx.currentTime;
    [784, 988, 1175, 1568].forEach((f, i) => {
      this.playTone({ freq: f, dur: 0.3, type: "triangle", gain: 0.26, at: tt + i * 0.08 });
      this.playTone({ freq: f * 2, dur: 0.2, type: "sine", gain: 0.12, at: tt + i * 0.08 + 0.02 });
    });
  }
  reviveTick(p: number) {
    if (!this.ctx) return;
    this.playTone({ freq: 300 + p * 500, dur: 0.06, type: "sine", gain: 0.14 });
  }
  reviveDone() {
    if (!this.ctx) return;
    const tt = this.ctx.currentTime;
    this.playTone({ freq: 110, dur: 0.5, type: "sawtooth", gain: 0.3, filter: 600 });
    [523, 784, 1046, 1568].forEach((f, i) => this.playTone({ freq: f, dur: 0.45, type: "triangle", gain: 0.26, at: tt + 0.08 + i * 0.07 }));
    this.noiseHit(0.35, 0.2, this.sfxGain ?? this.master!, tt);
  }
  dispose() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; this.ctx?.close(); this.ctx = null; this.started = false; }
}

/* ----------------------------- Types ----------------------------- */
type Vec = { x: number; y: number };
type Entity = Vec & {
  vx: number; vy: number; r: number; life: number; maxLife: number;
  kind: "orb" | "hazard" | "power" | "particle";
  color: string;
  power?: PowerId;
  angle?: number; spin?: number;
};
/** Onde de choc (activation, impact, réanimation) */
type Wave = { x: number; y: number; r: number; maxR: number; life: number; maxLife: number; color: string; width: number };
/** Texte flottant (score, combo, power-up) */
type Popup = { x: number; y: number; text: string; life: number; maxLife: number; color: string; size: number; vy: number };
const vibrate = (pattern: number | number[]) => { try { navigator.vibrate?.(pattern); } catch { /* noop */ } };
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dist2 = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

const LANG_KEY = "neon-rush-lang";

/* ----------------------------- Component ----------------------------- */
export default function NeonRush() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioEngine>(new AudioEngine());

  const [lang, setLang] = useState<Lang>("fr");
  const [prog, setProg] = useState<Progression>(() => defaultProg());
  const [mode, setMode] = useState<GameMode>("classic");
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [muted, setMuted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [rewardEarned, setRewardEarned] = useState<{ coins: number; xp: number; skin?: SkinId } | null>(null);
  const [toast, setToast] = useState<string>("");
  const [panel, setPanel] = useState<null | "modes" | "skins" | "pass" | "ranked" | "settings" | "leaderboard" | "missions" | "duo">(null);
  const [powers, setPowers] = useState<PowerTimers>(() => emptyTimers());
  const [secondCharges, setSecondCharges] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const [recordFlash, setRecordFlash] = useState(false);
  const [chestFx, setChestFx] = useState<null | { stage: "shake" | "reveal"; rarity: Rarity; name: string; colors: [string, string, string] }>(null);
  const [reviveHold, setReviveHold] = useState(0); // 0..1
  const { list: notifs, notify, dismiss: dismissNotif, clear: clearNotifs } = useNotifications();
  const [user, setUser] = useState<{ id: string; email: string | null } | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const pullFn = useServerFn(pullPlayerState);
  const pushFn = useServerFn(pushPlayerState);
  const submitScoreFn = useServerFn(submitScore);
  const fetchLbFn = useServerFn(fetchLeaderboard);
  const fetchRankFn = useServerFn(fetchMyRank);
  const pushTimer = useRef<number | null>(null);


  const passListRef = useRef<HTMLDivElement>(null);
  const [lbMode, setLbMode] = useState<GameMode>("classic");
  type LbRow = { user_id: string; mode: string; score: number; display_name: string | null; equipped_skin: string | null };
  const [lbRows, setLbRows] = useState<LbRow[]>([]);
  const [myRank, setMyRank] = useState<{ score: number; rank: number | null; total: number } | null>(null);
  const [lbLoading, setLbLoading] = useState(false);

  // ---- DUO COOP (2 joueurs, une équipe, un objectif commun) ----
  const DUO_DOWN_MS = 10000;
  const [duoCode, setDuoCode] = useState("");
  const [duoDownMs, setDuoDownMs] = useState(0);
  const duo = useDuo({
    userId: user?.id ?? null,
    displayName: prog.displayName ?? user?.email?.split("@")[0] ?? null,
    equippedSkin: prog.equipped,
  });
  const duoEndRef = useRef<(score: number) => void>(() => { /* set below */ });
  const duoDownRef = useRef<() => void>(() => { /* set below */ });
  const duoDoneRef = useRef<string | null>(null);
  const duoRewardedRef = useRef<string | null>(null);



  useEffect(() => {
    const l = (localStorage.getItem(LANG_KEY) as Lang) || (navigator.language.startsWith("es") ? "es" : navigator.language.startsWith("fr") ? "fr" : "en");
    setLang(l);
    setProg(loadProg());
    setHydrated(true);
  }, []);
  useEffect(() => { try { localStorage.setItem(LANG_KEY, lang); } catch { /* noop */ } }, [lang]);
  useEffect(() => { if (hydrated) saveProg(prog); }, [prog, hydrated]);

  // Refresh missions when day/week rolls over (checked every minute)
  useEffect(() => {
    if (!hydrated) return;
    const tick = () => setProg((p) => {
      const next = refreshMissionsIfNeeded(p.missions);
      if (next === p.missions) return p;
      return { ...p, missions: next };
    });
    const id = window.setInterval(tick, 60_000);
    return () => window.clearInterval(id);
  }, [hydrated]);

  // Apply a finished run's stats to missions.
  // Per-run stats (orbs, powers, score, combo, hardcoreScore) use MAX(progress, thisRun)
  // so a mission target must be reached WITHIN A SINGLE RUN — not by adding up runs.
  // Cumulative stats (runs, blitzRuns) still add across the day/week.
  const applyRunToMissions = useCallback((runStats: Partial<Record<MissionStat, number>>, finalMode: GameMode) => {
    setProg((p) => {
      const bump = (list: typeof p.missions.daily.list) => list.map((m) => {
        if (m.claimed) return m;
        const tpl = findTemplate(m.id);
        if (!tpl) return m;
        const v = runStats[tpl.stat];
        if (v == null || v <= 0) return m;
        if (tpl.stat === "blitzRuns" && finalMode !== "blitz") return m;
        if (tpl.stat === "hardcoreScore" && finalMode !== "hardcore") return m;
        const cumulative = tpl.stat === "runs" || tpl.stat === "blitzRuns";
        const next = cumulative ? m.progress + v : Math.max(m.progress, v);
        return { ...m, progress: Math.min(tpl.target, next) };
      });
      return {
        ...p,
        missions: {
          daily: { ...p.missions.daily, list: bump(p.missions.daily.list) },
          weekly: { ...p.missions.weekly, list: bump(p.missions.weekly.list) },
        },
      };
    });
  }, []);
  const applyRunRef = useRef(applyRunToMissions);
  useEffect(() => { applyRunRef.current = applyRunToMissions; }, [applyRunToMissions]);


  // Auth: track session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const s = data.session;
      setUser(s ? { id: s.user.id, email: s.user.email ?? null } : null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setUser(s ? { id: s.user.id, email: s.user.email ?? null } : null);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  // On login: pull remote → merge → push merged back
  useEffect(() => {
    if (!user || !hydrated) return;
    let cancel = false;
    (async () => {
      try {
        const remote = await pullFn();
        if (cancel) return;
        setProg((local) => {
          const merged = mergeProg(local, remote as never);
          pushFn({ data: progToRemote(merged) }).catch(() => { /* noop */ });
          return merged;
        });
      } catch { /* noop */ }
    })();
    return () => { cancel = true; };
  }, [user, hydrated, pullFn, pushFn]);

  // Debounced push on prog changes when signed-in
  useEffect(() => {
    if (!user || !hydrated) return;
    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    pushTimer.current = window.setTimeout(() => {
      pushFn({ data: progToRemote(prog) }).catch(() => { /* noop */ });
    }, 900);
    return () => { if (pushTimer.current) window.clearTimeout(pushTimer.current); };
  }, [prog, user, hydrated, pushFn]);

  const signOut = async () => { await supabase.auth.signOut(); };


  const tr = useCallback((k: string) => t(lang, k), [lang]);

  const equippedSkin = SKINS.find((s) => s.id === prog.equipped) || SKINS[0];
  const equippedFx = RARITY_FX[equippedSkin.rarity];
  const best = prog.bestByMode[mode] || 0;
  const rank = rankFor(Math.max(...Object.values(prog.bestByMode)));

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  // Game state
  const stateRef = useRef({
    player: { x: 0, y: 0, r: 14, tx: 0, ty: 0, trail: [] as Vec[] },
    entities: [] as Entity[], particles: [] as Entity[],
    waves: [] as Wave[], popups: [] as Popup[],
    t: 0, lastSpawn: 0, lastPower: 0, shake: 0,
    combo: 0, comboTimer: 0, score: 0, maxCombo: 0,
    powers: emptyTimers(),
    secondCharges: 0, invuln: 0,
    /** qualité adaptative des effets (1 = plein, 0.5 = mobile en difficulté) */
    q: 1, fpsAcc: 0, fpsFrames: 0,
    bestAtStart: 0, recordFired: false,
    dpr: 1, w: 0, h: 0, over: false, running: false, difficulty: 1,
    mode: "classic" as GameMode,
    skinColors: equippedSkin.colors as [string, string, string],
    skinFx: equippedFx,
    skinRarity: equippedSkin.rarity as Rarity,
    duration: 0,
    runOrbs: 0, runPowers: 0,
    duo: false,
  });

  const notifyRef = useRef(notify);
  useEffect(() => { notifyRef.current = notify; }, [notify]);
  const trRef = useRef((k: string) => t(lang, k));
  useEffect(() => { trRef.current = (k: string) => t(lang, k); }, [lang]);

  const start = useCallback(async (m: GameMode, opts?: { duo?: boolean; durationMs?: number }) => {
    await audioRef.current.start();
    const s = stateRef.current;
    s.entities = []; s.particles = []; s.waves = []; s.popups = [];
    s.player.x = s.w / 2; s.player.y = s.h / 2;
    s.player.tx = s.player.x; s.player.ty = s.player.y; s.player.trail = [];
    s.t = 0; s.lastSpawn = 0; s.lastPower = 0;
    s.combo = 0; s.comboTimer = 0; s.score = 0; s.shake = 0; s.maxCombo = 0;
    s.runOrbs = 0; s.runPowers = 0;
    s.powers = emptyTimers();
    s.secondCharges = 0; s.invuln = 0;
    s.q = 1; s.fpsAcc = 0; s.fpsFrames = 0;
    s.bestAtStart = prog.bestByMode[m] || 0; s.recordFired = false;
    s.over = false; s.difficulty = m === "hardcore" ? 1.5 : 1;
    s.mode = m;
    s.duo = !!opts?.duo;
    const sk = SKINS.find((k) => k.id === prog.equipped) || SKINS[0];
    s.skinColors = sk.colors as [string, string, string];
    s.skinFx = RARITY_FX[sk.rarity];
    s.skinRarity = sk.rarity;
    s.duration = opts?.durationMs ?? (m === "blitz" ? 60000 : 0);
    setMode(m); setScore(0); setCombo(0);
    setPowers(emptyTimers()); setSecondCharges(0); setRecordFlash(false); setReviveHold(0);
    clearNotifs();
    setTimeLeft(s.duration > 0 ? Math.ceil(s.duration / 1000) : 0);
    setGameOver(false); setRunning(true); setPanel(null); setRewardEarned(null);
    // Compte à rebours arcade (le Duo démarre sur le chrono serveur, sans délai)
    if (opts?.duo) { s.running = true; setCountdown(0); }
    else { s.running = false; setCountdown(3); }
  }, [prog.equipped, prog.bestByMode, clearNotifs]);

  // Compte à rebours 3 · 2 · 1 · GO
  useEffect(() => {
    if (countdown <= 0) return;
    audioRef.current.countBeep(countdown === 1);
    const id = window.setTimeout(() => {
      setCountdown((c) => {
        const n = c - 1;
        if (n <= 0) {
          const s = stateRef.current;
          if (!s.over) { s.running = true; s.waves.push({ x: s.w / 2, y: s.h / 2, r: 10, maxR: Math.max(s.w, s.h) * 0.7, life: 0, maxLife: 520, color: s.skinColors[1], width: 4 }); }
          audioRef.current.countBeep(true);
        }
        return Math.max(0, n);
      });
    }, 620);
    return () => window.clearTimeout(id);
  }, [countdown]);

  /* ---- Duo COOP orchestration: the network never touches the render loop ---- */
  const duoActive = !!duo.room && duo.room.status === "playing";
  const duoTeamScore = Math.max(duo.teamScore, score + (duo.partner?.score ?? 0));

  // Les deux alliés démarrent ensemble (chrono serveur partagé = ends_at)
  useEffect(() => {
    const r = duo.room;
    if (!r || r.status !== "playing" || running) return;
    if (duoDoneRef.current === r.id) return;
    const left = r.ends_at ? new Date(r.ends_at).getTime() - Date.now() : r.duration_s * 1000;
    if (left <= 800) return;
    duo.beginRun();
    setDuoDownMs(0);
    start("classic", { duo: true, durationMs: left });
  }, [duo.room, duo.beginRun, running, start]);

  // Contribution au score d'équipe (validée serveur, throttlée — aucun impact FPS)
  const duoPush = duo.pushScore;
  useEffect(() => {
    if (!duoActive || !running) return;
    const id = window.setInterval(() => duoPush(stateRef.current.score), 1200);
    return () => window.clearInterval(id);
  }, [duoActive, running, duoPush]);

  // Le joueur tombe à terre : la partie continue, l'allié peut le réanimer
  duoDownRef.current = () => {
    const s = stateRef.current;
    s.running = false;
    setDuoDownMs(DUO_DOWN_MS);
    duo.goDown(DUO_DOWN_MS);
  };

  // Fin de vie définitive : le serveur ne clôture que si toute l'équipe est éliminée
  duoEndRef.current = (finalScore: number) => {
    duoDoneRef.current = duo.room?.id ?? null;
    setDuoDownMs(0);
    setRunning(false);
    setPanel("duo");
    duo.endRun(finalScore);
  };

  // Compte à rebours de réanimation (affichage local, l'autorité reste au serveur)
  const meState = duo.me?.state ?? "alive";
  const meDownUntil = duo.me?.down_until ?? null;
  useEffect(() => {
    if (!duoActive || meState !== "down") return;
    const id = window.setInterval(() => {
      const left = meDownUntil ? new Date(meDownUntil).getTime() - Date.now() : 0;
      setDuoDownMs(Math.max(0, left));
    }, 200);
    return () => window.clearInterval(id);
  }, [duoActive, meState, meDownUntil]);

  // Réanimé par l'allié → retour en jeu, spectaculaire
  useEffect(() => {
    if (!duoActive) return;
    const s = stateRef.current;
    if (meState === "alive" && !s.running && !s.over && duoDoneRef.current !== duo.room?.id) {
      s.entities = s.entities.filter((e) => e.kind !== "hazard");
      s.powers.shield = 3000; setPowers({ ...s.powers });
      s.running = true;
      setDuoDownMs(0);
      audioRef.current.power();
      navigator.vibrate?.([25, 40, 25]);
      showToast(tr("duoRevived"));
    }
    if (meState === "dead" && !s.over) {
      s.over = true; s.running = false;
      duoEndRef.current(Math.floor(s.score));
    }
  }, [duoActive, meState, duo.room?.id, tr]);

  // Récompenses coop : basées sur la performance de l'ÉQUIPE (validées côté serveur)
  useEffect(() => {
    const res = duo.result; const room = duo.room;
    if (!res || !room || !res.settled) return;
    if (duoRewardedRef.current === room.id) return;
    duoRewardedRef.current = room.id;
    const secs = Math.floor(res.survivedMs / 1000);
    const coins = 100 + Math.floor(res.teamScore / 40) + res.revives * 40 + Math.floor(secs / 10) * 5;
    const xp = 150 + Math.floor(res.teamScore / 25) + res.revives * 60 + Math.floor(secs / 10) * 8;
    setProg((p) => ({
      ...p,
      coins: p.coins + coins,
      xp: p.xp + xp,
      duoBest: Math.max(p.duoBest ?? 0, res.teamScore),
      duoRevives: (p.duoRevives ?? 0) + res.revives,
    }));
    const s = stateRef.current;
    applyRunRef.current({
      runs: 1, blitzRuns: 0, score: res.teamScore, hardcoreScore: 0,
      combo: s.maxCombo, orbs: s.runOrbs || 0, powers: s.runPowers || 0,
    }, "classic");
    setToast(`🤝 +${coins} 🪙 · +${xp} XP`);
    setTimeout(() => setToast(""), 2600);
  }, [duo.result, duo.room]);





  // Input — Pointer Events for zero-latency touch/mouse tracking
  useEffect(() => {
    const canvas = canvasRef.current!;
    const s = stateRef.current;
    const setFromClient = (clientX: number, clientY: number, snap: boolean) => {
      const rect = canvas.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * s.w;
      const y = ((clientY - rect.top) / rect.height) * s.h;
      s.player.tx = x; s.player.ty = y;
      if (snap) { s.player.x = x; s.player.y = y; }
    };
    const onPointerDown = (e: PointerEvent) => {
      setFromClient(e.clientX, e.clientY, true);
      try { canvas.setPointerCapture(e.pointerId); } catch { /* noop */ }
    };
    const onPointerMove = (e: PointerEvent) => {
      // Coalesce for smoothest tracking
      const events = (e.getCoalescedEvents?.() as PointerEvent[] | undefined) ?? [e];
      const last = events[events.length - 1];
      setFromClient(last.clientX, last.clientY, e.pointerType !== "mouse");
      if (e.pointerType !== "mouse") e.preventDefault();
    };
    const keys: Record<string, boolean> = {};
    const kd = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = true; };
    const ku = (e: KeyboardEvent) => { keys[e.key.toLowerCase()] = false; };
    let raf = 0;
    const kbLoop = () => {
      const speed = 8;
      if (keys["arrowleft"] || keys["a"]) s.player.tx -= speed;
      if (keys["arrowright"] || keys["d"]) s.player.tx += speed;
      if (keys["arrowup"] || keys["w"]) s.player.ty -= speed;
      if (keys["arrowdown"] || keys["s"]) s.player.ty += speed;
      raf = requestAnimationFrame(kbLoop);
    };
    kbLoop();
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  // Resize
  useEffect(() => {
    const canvas = canvasRef.current!;
    const s = stateRef.current;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      s.dpr = dpr; s.w = canvas.clientWidth; s.h = canvas.clientHeight;
      canvas.width = s.w * dpr; canvas.height = s.h * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (s.player.x === 0 && s.player.y === 0) {
        s.player.x = s.w / 2; s.player.y = s.h / 2;
        s.player.tx = s.player.x; s.player.ty = s.player.y;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // End-of-run rewards. Skins are NO LONGER dropped from runs — chests + shop + BP only.
  const finishRun = useCallback((finalScore: number, finalMode: GameMode, finalCombo: number) => {
    const mult = REWARD_MULT[finalMode] ?? 1;
    const earnedCoins = Math.floor((finalScore / 10) * mult);
    const earnedXP = Math.floor((finalScore / 6) * mult);
    setProg((p) => {
      const bestByMode = { ...p.bestByMode, [finalMode]: Math.max(p.bestByMode[finalMode] || 0, finalScore) };
      return { ...p, coins: p.coins + earnedCoins, xp: p.xp + earnedXP, bestByMode };
    });
    setRewardEarned({ coins: earnedCoins, xp: earnedXP });

    // Missions: runs / score / combo (only if run wasn't quit early — Zen quits use gameOverNow too, we still count)
    // Missions — everything counts WITHIN THIS RUN (per-run max), except runs/blitzRuns which stay cumulative
    const s = stateRef.current;
    applyRunRef.current({
      runs: 1,
      blitzRuns: finalMode === "blitz" ? 1 : 0,
      score: finalScore,
      hardcoreScore: finalMode === "hardcore" ? finalScore : 0,
      combo: finalCombo,
      orbs: s.runOrbs || 0,
      powers: s.runPowers || 0,
    }, finalMode);

    // Leaderboard submit if signed in
    if (user && finalScore > 0) {
      submitScoreFn({ data: {
        mode: finalMode,
        score: finalScore,
        display_name: prog.displayName ?? user.email?.split("@")[0] ?? null,
        equipped_skin: prog.equipped,
      } }).catch(() => { /* noop */ });
    }
  }, [prog.displayName, prog.equipped, user, submitScoreFn]);


  // Main loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;
    let raf = 0;
    let last = performance.now();

    const spawn = () => {
      const edge = Math.floor(Math.random() * 4);
      let x = 0, y = 0;
      if (edge === 0) { x = -20; y = Math.random() * s.h; }
      else if (edge === 1) { x = s.w + 20; y = Math.random() * s.h; }
      else if (edge === 2) { x = Math.random() * s.w; y = -20; }
      else { x = Math.random() * s.w; y = s.h + 20; }
      const towards = { x: s.w / 2 + rand(-100, 100), y: s.h / 2 + rand(-100, 100) };
      const dx = towards.x - x, dy = towards.y - y;
      const len = Math.hypot(dx, dy) || 1;
      const speed = rand(1.2, 2.4) * s.difficulty;
      const hazardChance = s.mode === "hardcore" ? 0.55 : 0.32;
      const isHazard = Math.random() < hazardChance;
      s.entities.push({
        x, y, vx: (dx / len) * speed, vy: (dy / len) * speed,
        r: isHazard ? rand(14, 26) : rand(7, 11),
        life: 0, maxLife: 0,
        kind: isHazard ? "hazard" : "orb",
        color: isHazard ? "#ff2e6a" : "#7bf3ff",
        angle: rand(0, Math.PI * 2), spin: rand(-0.05, 0.05),
      });
    };
    const spawnPower = () => {
      const def = rollPower();
      s.entities.push({
        x: rand(60, Math.max(70, s.w - 60)), y: rand(60, Math.max(70, s.h - 60)),
        vx: 0, vy: 0, r: 15, life: 0, maxLife: 9000,
        kind: "power", color: def.color, power: def.id, angle: 0, spin: 0.03,
      });
    };
    /** Explosion de particules (quantité adaptée aux performances) */
    const burst = (x: number, y: number, color: string, count = 24, force = 1) => {
      const n = Math.max(4, Math.round(count * s.q));
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(1, 6) * force;
        s.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: rand(1, 3), life: 0, maxLife: rand(400, 900), kind: "particle", color });
      }
    };
    /** Onde de choc */
    const wave = (x: number, y: number, color: string, maxR = 160, width = 3, ms = 480) => {
      s.waves.push({ x, y, r: 6, maxR, life: 0, maxLife: ms, color, width });
    };
    /** Texte flottant */
    const popup = (x: number, y: number, text: string, color: string, size = 14) => {
      s.popups.push({ x, y, text, color, size, life: 0, maxLife: 900, vy: -0.6 });
    };
    /** Active un power-up : effet réel + feedback complet */
    const activatePower = (id: PowerId, x: number, y: number) => {
      const def = POWER_MAP[id];
      s.runPowers++;
      if (id === "second") {
        s.secondCharges = Math.min(2, s.secondCharges + 1);
        setSecondCharges(s.secondCharges);
      } else {
        s.powers[id] = def.durationMs;
        setPowers({ ...s.powers });
      }
      if (id === "boost") s.invuln = Math.max(s.invuln, 400);
      burst(x, y, def.color, 46, 1.5);
      wave(x, y, def.color, 190, 4, 520);
      wave(s.player.x, s.player.y, def.color, 120, 2, 380);
      popup(x, y - 18, `${trRef.current(def.labelKey)}`, def.color, 15);
      audioRef.current.powerUp(id);
      vibrate(id === "second" ? [20, 40, 20, 40, 30] : 22);
      notifyRef.current(`${trRef.current(def.labelKey)} ${trRef.current("pwOn")}`, {
        kind: id === "second" ? "epic" : "success", icon: def.glyph, color: def.color,
      });
      if (s.duo) notifyRef.current(trRef.current(def.coopKey), { kind: "info", icon: "🤝", ttl: 1800 });
      s.shake = Math.max(s.shake, 8);
    };
    const gameOverNow = (byTime = false) => {
      const fs = Math.floor(s.score);
      // COOP : le joueur tombe à terre, la partie continue pour l'équipe
      if (s.duo && !byTime) {
        s.running = false;
        audioRef.current.hit();
        setScore(fs);
        duoDownRef.current();
        return;
      }
      s.over = true; s.running = false;
      audioRef.current.gameover();
      setScore(fs); setRunning(false);
      if (s.duo) { setGameOver(false); duoEndRef.current(fs); return; }
      setGameOver(true);
      finishRun(fs, s.mode, s.maxCombo);
    };


    const loop = (now: number) => {
      const dt = Math.min(48, now - last); last = now;
      // Qualité adaptative : si le mobile souffre, on réduit les particules (jamais le contrôle)
      s.fpsAcc += dt; s.fpsFrames++;
      if (s.fpsFrames >= 45) {
        const avg = s.fpsAcc / s.fpsFrames;
        s.q = avg > 26 ? 0.4 : avg > 20 ? 0.7 : 1;
        s.fpsAcc = 0; s.fpsFrames = 0;
      }
      ctx.fillStyle = "rgba(10, 8, 22, 0.35)"; ctx.fillRect(0, 0, s.w, s.h);
      ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = "#3a1b6a"; ctx.lineWidth = 1;
      const gs = 40; const off = (s.t * 0.03) % gs;
      for (let x = -off; x < s.w; x += gs) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, s.h); ctx.stroke(); }
      for (let y = -off; y < s.h; y += gs) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s.w, y); ctx.stroke(); }
      ctx.restore();

      if (s.shake > 0) {
        const sx = rand(-s.shake, s.shake), sy = rand(-s.shake, s.shake);
        ctx.save(); ctx.translate(sx, sy); s.shake *= 0.88;
      }

      if (s.running) {
        s.t += dt;
        s.difficulty = (s.mode === "hardcore" ? 1.5 : 1) + Math.min(2.5, s.t / 30000);
        if (s.duration > 0) {
          const left = Math.max(0, s.duration - s.t);
          setTimeLeft(Math.ceil(left / 1000));
          if (left <= 0) { gameOverNow(); }
        }
        const spawnBase = 700;
        const spawnMin = 260;
        const spawnRate = Math.max(spawnMin, spawnBase - s.t * 0.05);
        if (s.t - s.lastSpawn > spawnRate) {
          spawn(); if (Math.random() < 0.15 * s.difficulty) spawn(); s.lastSpawn = s.t;
        }
        // Hardcore aussi a droit aux power-ups (plus rares) : ils sont indispensables au feeling
        const powerEvery = s.mode === "hardcore" ? 13000 : 8500;
        if (s.t - s.lastPower > powerEvery) { spawnPower(); s.lastPower = s.t; }

        // Tight tracking for touch/mouse (input already snaps on touch); smooth for keyboard
        const boosting = s.powers.boost > 0;
        const follow = boosting ? 0.72 : 0.55;
        s.player.x += (s.player.tx - s.player.x) * follow;
        s.player.y += (s.player.ty - s.player.y) * follow;
        s.player.x = Math.max(s.player.r, Math.min(s.w - s.player.r, s.player.x));
        s.player.y = Math.max(s.player.r, Math.min(s.h - s.player.r, s.player.y));
        s.player.trail.push({ x: s.player.x, y: s.player.y });
        const trailLen = s.skinFx.trailLen + (boosting ? 10 : 0);
        while (s.player.trail.length > trailLen) s.player.trail.shift();
        // Trainée de vitesse
        if (boosting && Math.random() < 0.7 * s.q) {
          const a = Math.random() * Math.PI * 2;
          s.particles.push({ x: s.player.x, y: s.player.y, vx: Math.cos(a) * 1.2, vy: Math.sin(a) * 1.2, r: rand(1, 2.5), life: 0, maxLife: 380, kind: "particle", color: POWER_MAP.boost.color });
        }

        // Décompte des effets + animation de fin
        POWER_IDS.forEach((k) => {
          const before = s.powers[k];
          if (before <= 0) return;
          const next = Math.max(0, before - dt);
          s.powers[k] = next;
          if (next === 0) {
            const def = POWER_MAP[k];
            wave(s.player.x, s.player.y, def.color, 130, 2, 420);
            burst(s.player.x, s.player.y, def.color, 16, 1);
            audioRef.current.expire();
            notifyRef.current(`${trRef.current(def.labelKey)} ${trRef.current("pwEnd")}`, { kind: "warn", icon: def.glyph, ttl: 1500 });
            setPowers({ ...s.powers });
          }
        });
        s.invuln = Math.max(0, s.invuln - dt);
        s.comboTimer = Math.max(0, s.comboTimer - dt);
        if (s.comboTimer === 0 && s.combo > 0) s.combo = 0;

        const slowFactor = s.powers.slow > 0 ? 0.35 : 1;
        const magnetR = s.powers.magnet > 0 ? 210 : 0;

        for (let i = s.entities.length - 1; i >= 0; i--) {
          const e = s.entities[i];
          if (e.kind === "power") {
            e.life += dt; e.angle = (e.angle || 0) + (e.spin || 0);
            if (e.life > e.maxLife) { s.entities.splice(i, 1); continue; }
          } else {
            if (magnetR && e.kind === "orb") {
              const dx = s.player.x - e.x, dy = s.player.y - e.y;
              const d = Math.hypot(dx, dy) || 1;
              if (d < magnetR) {
                e.vx += (dx / d) * 0.55; e.vy += (dy / d) * 0.55;
                // Filet de particules vers le joueur
                if (Math.random() < 0.25 * s.q) {
                  s.particles.push({ x: e.x, y: e.y, vx: (dx / d) * 3, vy: (dy / d) * 3, r: 1.4, life: 0, maxLife: 320, kind: "particle", color: POWER_MAP.magnet.color });
                }
              }
            }
            e.x += e.vx * slowFactor * (dt / 16);
            e.y += e.vy * slowFactor * (dt / 16);
            e.angle = (e.angle || 0) + (e.spin || 0);
            if (e.x < -60 || e.x > s.w + 60 || e.y < -60 || e.y > s.h + 60) { s.entities.splice(i, 1); continue; }
          }
          const rr = (e.r + s.player.r) ** 2;
          if (dist2(e, s.player) < rr) {
            if (e.kind === "orb") {
              s.combo++; s.comboTimer = 1800;
              const comboUp = s.combo > s.maxCombo;
              if (comboUp) s.maxCombo = s.combo;
              const mul = (s.powers.x2 > 0 ? 2 : 1) * (s.powers.boost > 0 ? 1.25 : 1);
              const gain = Math.round((10 + s.combo * 2) * mul);
              s.score += gain; setScore(Math.floor(s.score)); setCombo(s.combo);
              audioRef.current.pickup(s.combo);
              burst(e.x, e.y, s.skinColors[1], Math.round(18 * s.skinFx.particles), 1);
              popup(e.x, e.y, `+${gain}`, s.powers.x2 > 0 ? POWER_MAP.x2.color : s.skinColors[1], s.powers.x2 > 0 ? 16 : 13);
              if (s.combo > 0 && s.combo % 10 === 0) {
                wave(s.player.x, s.player.y, POWER_MAP.x2.color, 200, 3, 460);
                popup(s.player.x, s.player.y - 34, `×${s.combo}`, "#fff17a", 20);
                vibrate(12);
              }
              // Nouveau record en direct
              if (!s.recordFired && s.bestAtStart > 0 && s.score > s.bestAtStart) {
                s.recordFired = true;
                audioRef.current.record();
                wave(s.player.x, s.player.y, "#fff17a", 320, 5, 700);
                burst(s.player.x, s.player.y, "#fff17a", 60, 2);
                vibrate([30, 50, 30]);
                notifyRef.current(trRef.current("newRecord"), { kind: "epic", icon: "🏆" });
                setRecordFlash(true);
                window.setTimeout(() => setRecordFlash(false), 900);
              }
              s.entities.splice(i, 1);
              s.runOrbs++;
            } else if (e.kind === "power" && e.power) {
              activatePower(e.power, e.x, e.y);
              s.entities.splice(i, 1);
            } else if (e.kind === "hazard") {
              if (s.invuln > 0) {
                // rien : fenêtre d'invulnérabilité (retour en jeu / turbo)
              } else if (s.powers.shield > 0) {
                s.powers.shield = 0; setPowers({ ...s.powers });
                burst(e.x, e.y, POWER_MAP.shield.color, 44, 1.6);
                wave(s.player.x, s.player.y, POWER_MAP.shield.color, 200, 5, 480);
                s.shake = 16; s.invuln = 350;
                audioRef.current.powerUp("shield");
                vibrate(30);
                notifyRef.current(`${trRef.current("shield")} — ${trRef.current("pwEnd")}`, { kind: "warn", icon: "⛨", ttl: 1600 });
                s.entities.splice(i, 1);
              } else if (s.secondCharges > 0) {
                // SECONDE CHANCE : on survit, les dangers proches sont pulvérisés
                s.secondCharges--; setSecondCharges(s.secondCharges);
                s.entities = s.entities.filter((o) => o.kind !== "hazard" || dist2(o, s.player) > 240 ** 2);
                s.invuln = 2200; s.powers.shield = Math.max(s.powers.shield, 1800);
                setPowers({ ...s.powers });
                burst(s.player.x, s.player.y, POWER_MAP.second.color, 90, 2.4);
                wave(s.player.x, s.player.y, POWER_MAP.second.color, 340, 6, 760);
                wave(s.player.x, s.player.y, "#ffffff", 200, 3, 520);
                s.shake = 22;
                audioRef.current.reviveDone();
                vibrate([40, 60, 40]);
                notifyRef.current(trRef.current("secondUsed"), { kind: "epic", icon: "✚" });
              } else {
                burst(s.player.x, s.player.y, "#ff2e6a", 80, 2.2);
                wave(s.player.x, s.player.y, "#ff2e6a", 280, 5, 620);
                s.shake = 28; audioRef.current.hit(); vibrate([50, 30, 90]); gameOverNow();
              }
            }
          }
        }
        for (let i = s.particles.length - 1; i >= 0; i--) {
          const p = s.particles[i];
          p.life += dt; p.x += p.vx; p.y += p.vy;
          p.vx *= 0.97; p.vy *= 0.97;
          if (p.life > p.maxLife) s.particles.splice(i, 1);
        }
      }

      // Ondes + textes flottants continuent d'animer même à l'arrêt (fin de partie propre)
      for (let i = s.waves.length - 1; i >= 0; i--) {
        const w = s.waves[i];
        w.life += dt;
        w.r = 6 + (w.maxR - 6) * Math.min(1, w.life / w.maxLife);
        if (w.life > w.maxLife) s.waves.splice(i, 1);
      }
      for (let i = s.popups.length - 1; i >= 0; i--) {
        const p = s.popups[i];
        p.life += dt; p.y += p.vy * (dt / 16);
        if (p.life > p.maxLife) s.popups.splice(i, 1);
      }

      ctx.globalCompositeOperation = "lighter";
      // Trail tinted with equipped skin's mid color
      const [tc0, tc1] = s.skinColors;
      for (let i = 0; i < s.player.trail.length; i++) {
        const tt = s.player.trail[i]; const a = i / s.player.trail.length;
        ctx.beginPath();
        ctx.fillStyle = i % 2 === 0
          ? `rgba(255,255,255,${a * 0.25})`
          : `${tc1}${Math.floor(a * 90 + 20).toString(16).padStart(2, "0")}`;
        void tc0;
        ctx.arc(tt.x, tt.y, s.player.r * (0.3 + a * 0.9), 0, Math.PI * 2);
        ctx.fill();
      }
      for (const e of s.entities) {
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(e.angle || 0);
        if (e.kind === "orb") {
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, e.r * 3);
          g.addColorStop(0, "rgba(160,255,255,1)");
          g.addColorStop(0.4, "rgba(123,243,255,0.7)");
          g.addColorStop(1, "rgba(123,243,255,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, e.r * 3, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#eaffff"; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.7, 0, Math.PI * 2); ctx.fill();
        } else if (e.kind === "hazard") {
          // Compact halo (smaller radius = sharper on high-DPR mobile)
          const g = ctx.createRadialGradient(0, 0, e.r * 0.6, 0, 0, e.r * 1.6);
          g.addColorStop(0, "rgba(255,60,120,0.55)");
          g.addColorStop(1, "rgba(255,46,106,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, e.r * 1.6, 0, Math.PI * 2); ctx.fill();
          // Crisp solid body
          ctx.fillStyle = "#ff2e6a"; ctx.beginPath(); ctx.arc(0, 0, e.r, 0, Math.PI * 2); ctx.fill();
          // Sharp spike ring outline
          ctx.strokeStyle = "#ffe0ec"; ctx.lineWidth = 1.5; ctx.beginPath();
          const spikes = 8;
          for (let k = 0; k < spikes * 2; k++) {
            const rr = k % 2 === 0 ? e.r * 1.05 : e.r * 0.7;
            const a = (k / (spikes * 2)) * Math.PI * 2;
            const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.stroke();
          // Bright core
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(0, 0, e.r * 0.3, 0, Math.PI * 2); ctx.fill();
        } else if (e.kind === "power") {
          const def = POWER_MAP[e.power as PowerId];
          const c = def?.color || "#fff17a";
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, e.r * 3);
          g.addColorStop(0, c); g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, e.r * 3, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            const px = Math.cos(a) * e.r, py = Math.sin(a) * e.r;
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.stroke();
          ctx.fillStyle = "#0b0620"; ctx.font = "bold 12px Orbitron, sans-serif";
          ctx.textAlign = "center"; ctx.textBaseline = "middle";
          ctx.fillText(def?.glyph || "?", 0, 1);
        }
        ctx.restore();
      }
      for (const p of s.particles) {
        const a = 1 - p.life / p.maxLife;
        ctx.fillStyle = p.color; ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Ondes de choc
      for (const w of s.waves) {
        const a = 1 - w.life / w.maxLife;
        ctx.globalAlpha = a * 0.9;
        ctx.strokeStyle = w.color; ctx.lineWidth = w.width * a + 0.5;
        ctx.beginPath(); ctx.arc(w.x, w.y, w.r, 0, Math.PI * 2); ctx.stroke();
      }
      // Scores flottants
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      for (const p of s.popups) {
        const a = 1 - p.life / p.maxLife;
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.font = `bold ${p.size}px Orbitron, sans-serif`;
        ctx.fillText(p.text, p.x, p.y);
      }
      ctx.globalAlpha = 1;

      // Player with skin
      const pr = s.player.r;
      const hasShield = s.powers.shield > 0;
      if (hasShield) {
        ctx.strokeStyle = "rgba(160,255,234,0.9)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(s.player.x, s.player.y, pr + 10 + Math.sin(s.t / 100) * 2, 0, Math.PI * 2); ctx.stroke();
      }
      const [c0, c1, c2] = s.skinColors;
      const pulse = 1 + Math.sin(s.t / 200) * s.skinFx.pulse;
      // Mythic/legendary aura ring
      if (s.skinFx.aura > 0) {
        const ar = pr * (2.2 + s.skinFx.aura) * pulse;
        const ag = ctx.createRadialGradient(s.player.x, s.player.y, pr * 0.8, s.player.x, s.player.y, ar);
        ag.addColorStop(0, `${c1}55`);
        ag.addColorStop(0.6, `${c1}22`);
        ag.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(s.player.x, s.player.y, ar, 0, Math.PI * 2); ctx.fill();
      }
      const pg = ctx.createRadialGradient(s.player.x, s.player.y, 0, s.player.x, s.player.y, pr * 3 * pulse);
      pg.addColorStop(0, c0); pg.addColorStop(0.3, c1); pg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(s.player.x, s.player.y, pr * 3 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(s.player.x, s.player.y, pr * 0.9 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.arc(s.player.x, s.player.y, pr * 0.5, 0, Math.PI * 2); ctx.fill();

      ctx.globalCompositeOperation = "source-over";
      if (s.shake > 0) ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [finishRun]);

  useEffect(() => { audioRef.current.setMuted(muted); }, [muted]);

  // Share button — Web Share, else clipboard + open X intent
  const share = async () => {
    const url = window.location.href;
    const text = lang === "fr"
      ? `J'ai fait ${score} points en ${t(lang, MODES.find(m => m.id === mode)!.nameKey)} sur NEON RUSH 🎮✨ Tu bats ça ?`
      : lang === "es"
      ? `¡Conseguí ${score} puntos en ${t(lang, MODES.find(m => m.id === mode)!.nameKey)} en NEON RUSH 🎮✨! ¿Puedes superarlo?`
      : `I scored ${score} in ${t(lang, MODES.find(m => m.id === mode)!.nameKey)} on NEON RUSH 🎮✨ Beat that?`;
    // Try Web Share API
    if (typeof navigator !== "undefined" && (navigator as Navigator & { share?: (data: ShareData) => Promise<void> }).share) {
      try {
        await (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share({ title: "NEON RUSH", text, url });
        return;
      } catch { /* user cancelled or blocked, fall through */ }
    }
    // Clipboard fallback
    try { await navigator.clipboard.writeText(`${text} ${url}`); showToast(tr("shared")); }
    catch { showToast(tr("shared")); }
    // Open Twitter/X intent in new tab as bonus
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
    window.open(intent, "_blank", "noopener,noreferrer");
  };

  // Pass helpers
  const passTier = Math.min(PASS_TIERS, Math.floor(prog.xp / PASS_XP_PER_TIER));
  const passProgressPct = ((prog.xp % PASS_XP_PER_TIER) / PASS_XP_PER_TIER) * 100;

  // Auto-scroll Battle Pass list to current tier when opening the panel
  useEffect(() => {
    if (panel !== "pass") return;
    const id = window.setTimeout(() => {
      const list = passListRef.current;
      if (!list) return;
      const tier = Math.min(passTier, PASS_TIERS - 1);
      const el = list.querySelector<HTMLElement>(`[data-tier="${tier}"]`);
      if (el) list.scrollTo({ top: Math.max(0, el.offsetTop - 80), behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(id);
  }, [panel, passTier]);


  const claimTier = (i: number) => {
    if (i >= passTier || prog.claimed.includes(i)) return;
    const reward = PASS_REWARDS[i];
    setProg((p) => {
      let np = { ...p, claimed: [...p.claimed, i] };
      if (reward.type === "coins") np = { ...np, coins: np.coins + (reward.value as number) };
      else if (reward.type === "xp") np = { ...np, xp: np.xp + (reward.value as number) };
      else if (reward.type === "chest") np = { ...np, coins: np.coins + 200 * (reward.value as number) };
      else if (reward.type === "skin") {
        const sk = reward.value as SkinId;
        if (!np.owned.includes(sk)) np = { ...np, owned: [...np.owned, sk] };
      }
      return np;
    });
    showToast(tr("claimed"));
  };

  const buySkin = (id: SkinId) => {
    const sk = SKINS.find((s) => s.id === id)!;
    if (sk.passOnly || sk.chestOnly) return; // legendary/mythic = chest only
    if (prog.owned.includes(id)) return;
    if (prog.coins < sk.price) { showToast(tr("notEnough")); return; }
    setProg((p) => ({ ...p, coins: p.coins - sk.price, owned: [...p.owned, id] }));
    showToast(tr("owned"));
  };
  const equipSkin = (id: SkinId) => {
    if (!prog.owned.includes(id)) return;
    setProg((p) => ({ ...p, equipped: id }));
  };
  const openChest = () => {
    if (prog.coins < CHEST_COST) { showToast(tr("notEnough")); return; }
    const reward = rollChestReward(prog.owned);
    setProg((p) => {
      let np = { ...p, coins: p.coins - CHEST_COST };
      if (reward.type === "skin") {
        np = { ...np, owned: [...np.owned, reward.skin] };
        const name = SKINS.find((s) => s.id === reward.skin)?.name ?? reward.skin;
        showToast(`✨ ${reward.rarity.toUpperCase()} — ${name}`);
      } else {
        np = { ...np, coins: np.coins + reward.coins };
        showToast(`🪙 +${reward.coins} · ${reward.rarity.toUpperCase()} (déjà tout obtenu)`);
      }
      return np;
    });
    // Rarity-tuned audio
    if (reward.rarity === "mythic") audioRef.current.mythicSound();
    else if (reward.rarity === "legendary") audioRef.current.legendarySound();
    else audioRef.current.power();
  };


  const claimMission = (id: string) => {
    const tpl = findTemplate(id); if (!tpl) return;
    setProg((p) => {
      const done = (m: { id: string; progress: number; claimed: boolean }) => m.id === id && !m.claimed && m.progress >= tpl.target;
      const dailyHit = p.missions.daily.list.some(done);
      const weeklyHit = p.missions.weekly.list.some(done);
      if (!dailyHit && !weeklyHit) return p;
      const upd = (list: typeof p.missions.daily.list) => list.map((m) => (done(m) ? { ...m, claimed: true } : m));
      return {
        ...p, coins: p.coins + tpl.coins, xp: p.xp + tpl.xp,
        missions: {
          daily: { ...p.missions.daily, list: upd(p.missions.daily.list) },
          weekly: { ...p.missions.weekly, list: upd(p.missions.weekly.list) },
        },
      };
    });
    showToast(`+${tpl.coins} 🪙 · +${tpl.xp} XP`);
  };

  // Leaderboard: load + realtime when panel open
  useEffect(() => {
    if (panel !== "leaderboard") return;
    let cancel = false;
    const load = async () => {
      setLbLoading(true);
      try {
        const [rows, mine] = await Promise.all([
          fetchLbFn({ data: { mode: lbMode } }),
          user ? fetchRankFn({ data: { mode: lbMode } }) : Promise.resolve(null),
        ]);
        if (!cancel) { setLbRows(rows as LbRow[]); setMyRank(mine as { score: number; rank: number | null; total: number } | null); }
      } finally { if (!cancel) setLbLoading(false); }
    };
    load();
    const ch = supabase
      .channel(`lb-${lbMode}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "leaderboard_scores", filter: `mode=eq.${lbMode}` }, () => load())
      .subscribe();
    return () => { cancel = true; supabase.removeChannel(ch); };
  }, [panel, lbMode, user, fetchLbFn, fetchRankFn]);

  const activePowers = (Object.keys(powers) as Array<keyof typeof powers>).filter((k) => powers[k] > 0);
  const powerKeyMap: Record<string, string> = { shield: "shield", slow: "slow", magnet: "magnet", x2: "x2" };
  const powerColor: Record<string, string> = { shield: "text-glow-cyan", slow: "text-glow-magenta", magnet: "text-glow-yellow", x2: "text-glow-yellow" };

  const currentModeName = useMemo(() => tr(MODES.find(m => m.id === mode)!.nameKey), [mode, tr]);

  return (
    <main className="scanlines relative h-screen w-screen overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ touchAction: "none" }} />
      <div className="scanlines-overlay" />

      {/* HUD */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3 sm:p-6">
        <div className="panel-neon pointer-events-auto rounded-xl px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{tr("score")}</div>
          <div className="font-display text-3xl font-black text-glow-cyan tabular-nums">{score}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {tr("best")} : <span className="text-glow-yellow">{best}</span>
          </div>
          {running && (mode === "blitz" || duoActive) && (
            <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {tr("time")} : <span className="text-glow-magenta">{timeLeft}s</span>
            </div>
          )}
          {duoActive && (
            <>
              <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                🤝 {tr("duoTeamScore")} : <span className="text-glow-yellow tabular-nums">{duoTeamScore}</span>
              </div>
              <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {tr("duoPartner")} : <span className="text-glow-magenta">{tr(duo.partner ? ({ alive: "duoAlive", down: "duoDown", dead: "duoDead", disconnected: "duoDisconnected" }[duo.partner.state] ?? "duoAlive") : "duoWaiting")}</span>
              </div>
            </>
          )}
        </div>





        <div className="flex flex-col items-end gap-2">
          <button onClick={() => setMuted((m) => !m)} className="panel-neon pointer-events-auto rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest text-glow-cyan transition hover:scale-105">
            {muted ? `🔇 ${tr("muted")}` : `🔊 ${tr("sound")}`}
          </button>
          {running && (
            <button
              onClick={() => {
                const s = stateRef.current;
                s.running = false; s.over = true;
                setRunning(false); setGameOver(false); setRewardEarned(null);
              }}
              className="panel-neon pointer-events-auto rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest text-glow-magenta transition hover:scale-105"
            >
              ✕ {tr("quit")}
            </button>
          )}
          {combo > 1 && running && (
            <div className="panel-neon rounded-xl px-4 py-2 animate-scale-in">
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{tr("combo")}</div>
              <div className="font-display text-2xl font-black text-glow-magenta tabular-nums">×{combo}</div>
            </div>
          )}
        </div>
      </header>

      {activePowers.length > 0 && running && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center gap-2 px-4">
          {activePowers.map((k) => (
            <div key={k} className="panel-neon float-y rounded-full px-4 py-2">
              <span className={`text-xs font-bold uppercase tracking-[0.2em] ${powerColor[k]}`}>
                {tr(powerKeyMap[k])} · {Math.ceil(powers[k] / 1000)}s
              </span>
            </div>
          ))}
        </div>
      )}

      {/* COOP : allié à terre → réanimation */}
      {duoActive && duo.partnerDown && duo.me?.state === "alive" && duo.partner && (
        <div className="absolute inset-x-0 bottom-24 z-30 flex flex-col items-center gap-2 px-4">
          <div className="panel-neon pulse-glow rounded-full px-5 py-2 text-xs font-black uppercase tracking-[0.25em] text-glow-magenta">
            ⚠ {tr("duoPartnerDown")}
          </div>
          <button
            onClick={() => duo.revivePartner(duo.partner!.user_id)}
            className="rounded-2xl border border-[color:var(--neon-cyan)] bg-gradient-to-r from-[color:var(--neon-cyan)]/30 to-[color:var(--neon-magenta)]/30 px-8 py-4 font-display text-base font-black uppercase tracking-[0.3em] text-glow-cyan transition hover:scale-105"
          >
            ✚ {tr("duoRevive")}
          </button>
        </div>
      )}

      {/* COOP : je suis à terre → compte à rebours */}
      {duoActive && duo.me?.state === "down" && (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-black/55 backdrop-blur-sm">
          <div className="font-display text-4xl font-black uppercase tracking-[0.2em] text-glow-magenta animate-pulse">{tr("duoYouDown")}</div>
          <div className="font-display text-6xl font-black text-glow-yellow tabular-nums">{Math.ceil(duoDownMs / 1000)}</div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-muted-foreground">{tr("duoWaitRevive")}</div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none absolute inset-x-0 top-24 z-30 flex justify-center animate-fade-in">
          <div className="panel-neon rounded-full px-5 py-2 text-xs font-bold uppercase tracking-[0.25em] text-glow-yellow">{toast}</div>
        </div>
      )}

      {/* MAIN MENU */}
      {!running && !panel && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 overflow-y-auto">
          <div className="panel-neon pulse-glow w-full max-w-md rounded-2xl p-6 sm:p-8 text-center animate-fade-in my-auto">
            <div className="mb-2 text-xs uppercase tracking-[0.5em] text-muted-foreground">{tr("tagline")}</div>
            <h1 className="font-display text-5xl font-black leading-none sm:text-6xl">
              <span className="text-glow-cyan">NEON</span> <span className="text-glow-magenta">RUSH</span>
            </h1>

            {/* Rank + Coins strip */}
            <div className="mt-4 flex items-center justify-center gap-3 text-[10px] uppercase tracking-[0.2em]">
              <span className="panel-neon rounded-full px-3 py-1" style={{ color: rank.color, textShadow: `0 0 10px ${rank.color}` }}>
                {tr("rank")} · {rank.name}
              </span>
              <span className="panel-neon rounded-full px-3 py-1 text-glow-yellow">🪙 {prog.coins}</span>
            </div>

            {/* Account */}
            <div className="mt-3 flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.2em]">
              {user ? (
                <>
                  <span className="panel-neon rounded-full px-3 py-1 text-glow-cyan truncate max-w-[220px]">☁ {user.email ?? "Compte"}</span>
                  <button onClick={signOut} className="panel-neon rounded-full px-3 py-1 text-glow-magenta hover:scale-105 transition">
                    {tr("signOut")}
                  </button>
                </>
              ) : (
                <Link to="/auth" className="panel-neon rounded-full px-3 py-1 text-glow-cyan hover:scale-105 transition">
                  ☁ {tr("signIn")}
                </Link>
              )}
            </div>

            <p className="mx-auto mt-4 max-w-sm text-sm text-muted-foreground">{tr("intro")}</p>

            {gameOver && (
              <div className="mt-5 rounded-xl border border-border/60 bg-black/30 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{tr("final")} · {currentModeName}</div>
                <div className="font-display text-4xl font-black text-glow-magenta tabular-nums">{score}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {tr("record")} : <span className="text-glow-yellow">{best}</span>
                </div>
                {rewardEarned && (
                  <div className="mt-3 flex justify-center gap-3 text-[11px] uppercase tracking-[0.2em]">
                    <span className="text-glow-yellow">+{rewardEarned.coins} 🪙</span>
                    <span className="text-glow-cyan">+{rewardEarned.xp} XP</span>
                    {rewardEarned.skin && <span className="text-glow-magenta">✨ {rewardEarned.skin}</span>}
                  </div>
                )}
              </div>
            )}

            <button onClick={() => start(mode)} className="mt-6 w-full rounded-xl border border-[color:var(--neon-cyan)] bg-gradient-to-r from-[color:var(--neon-cyan)]/20 via-[color:var(--neon-magenta)]/20 to-[color:var(--neon-cyan)]/20 px-6 py-4 font-display text-lg font-black uppercase tracking-[0.3em] text-glow-cyan transition hover:scale-[1.02] hover:shadow-[0_0_40px_-5px_var(--neon-magenta)]">
              {gameOver ? tr("replay") : tr("play")} · {currentModeName}
            </button>

            {gameOver && (
              <button onClick={share} className="mt-3 w-full rounded-xl border border-border/60 bg-black/20 px-6 py-3 font-display text-sm font-bold uppercase tracking-[0.3em] text-glow-yellow transition hover:scale-[1.02]">
                {tr("share")}
              </button>
            )}

            {/* Nav tabs */}
            <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 text-xs uppercase tracking-[0.2em]">
              <button onClick={() => setPanel("modes")} className="panel-neon rounded-lg py-2 text-glow-cyan hover:scale-105 transition">{tr("mode")}</button>
              <button onClick={() => setPanel("skins")} className="panel-neon rounded-lg py-2 text-glow-magenta hover:scale-105 transition">{tr("skins")}</button>
              <button onClick={() => setPanel("pass")} className="panel-neon rounded-lg py-2 text-glow-yellow hover:scale-105 transition">{tr("pass")}</button>
              <button onClick={() => setPanel("missions")} className="panel-neon rounded-lg py-2 text-glow-cyan hover:scale-105 transition">{tr("missions")}</button>
              <button onClick={() => setPanel("leaderboard")} className="panel-neon rounded-lg py-2 text-glow-yellow hover:scale-105 transition">🌍 {tr("leaderboard")}</button>
              <button onClick={() => setPanel("ranked")} className="panel-neon rounded-lg py-2 text-glow-cyan hover:scale-105 transition">{tr("ranked")}</button>
              <button onClick={() => setPanel("duo")} className="panel-neon rounded-lg py-2 text-glow-magenta hover:scale-105 transition col-span-2 sm:col-span-3">🤝 {tr("duo")}</button>
              <button onClick={() => setPanel("settings")} className="panel-neon rounded-lg py-2 text-glow-magenta hover:scale-105 transition col-span-2 sm:col-span-3">{tr("settings")}</button>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2 text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              <div>{tr("controls1")}</div>
              <div>{tr("controls2")}</div>
            </div>
          </div>
        </div>
      )}

      {/* SUB-PANELS */}
      {!running && panel && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-4 overflow-y-auto">
          <div className="panel-neon w-full max-w-lg rounded-2xl p-6 animate-fade-in my-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-2xl font-black text-glow-cyan uppercase tracking-widest">{tr(panel === "modes" ? "mode" : panel)}</h2>
              <button onClick={() => setPanel(null)} className="panel-neon rounded-lg px-3 py-1 text-xs uppercase tracking-widest text-glow-magenta">{tr("back")}</button>
            </div>

            {panel === "modes" && (
              <div className="space-y-2">
                {MODES.map((m) => (
                  <button key={m.id} onClick={() => { setMode(m.id); showToast(tr(m.nameKey)); }} className={`w-full rounded-xl border p-3 text-left transition ${mode === m.id ? "border-[color:var(--neon-cyan)] bg-[color:var(--neon-cyan)]/10" : "border-border/50 bg-black/20 hover:border-[color:var(--neon-magenta)]"}`}>
                    <div className="font-display text-lg font-black text-glow-cyan uppercase tracking-widest">{tr(m.nameKey)}</div>
                    <div className="text-xs text-muted-foreground">{tr(m.descKey)}</div>
                    <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-glow-yellow">{tr("best")}: {prog.bestByMode[m.id]}</div>
                  </button>
                ))}
                <button onClick={() => setPanel("duo")} className="w-full rounded-xl border border-[color:var(--neon-magenta)]/60 bg-[color:var(--neon-magenta)]/10 p-3 text-left transition hover:border-[color:var(--neon-magenta)]">
                  <div className="font-display text-lg font-black text-glow-magenta uppercase tracking-widest">🤝 {tr("duo")}</div>
                  <div className="text-xs text-muted-foreground">{tr("duoDesc")}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-glow-yellow">{tr("best")} · {tr("duoTeamScore")}: {prog.duoBest ?? 0}</div>
                </button>
              </div>
            )}

            {panel === "skins" && (
              <div>
                <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.2em]">
                  <span className="text-glow-yellow">🪙 {prog.coins}</span>
                  <button onClick={openChest} className="panel-neon rounded-lg px-3 py-1 text-glow-magenta hover:scale-105 transition">🎁 {tr("openChest")} · {CHEST_COST}</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {SKINS.map((s) => {
                    const owned = prog.owned.includes(s.id);
                    const eq = prog.equipped === s.id;
                    const rc = RARITY_COLOR[s.rarity];
                    const locked = !owned && (s.chestOnly || s.passOnly);
                    return (
                      <div key={s.id} className="rounded-xl border p-3" style={{ borderColor: `${rc}55`, background: `linear-gradient(180deg, ${rc}10, rgba(0,0,0,0.35))` }}>
                        <div className="mx-auto h-12 w-12 rounded-full" style={{ background: `radial-gradient(circle at 30% 30%, ${s.colors[0]}, ${s.colors[1]} 50%, ${s.colors[2]})`, boxShadow: `0 0 24px ${rc}` }} />
                        <div className="mt-2 text-center text-xs font-bold uppercase tracking-widest">{s.name}</div>
                        <div className="text-center text-[10px] uppercase tracking-[0.25em] font-bold" style={{ color: rc, textShadow: `0 0 8px ${rc}` }}>{s.rarity}</div>
                        <button
                          onClick={() => (owned ? equipSkin(s.id) : buySkin(s.id))}
                          disabled={eq || locked}
                          className={`mt-2 w-full rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-widest transition ${eq ? "bg-[color:var(--neon-cyan)]/20 text-glow-cyan" : owned ? "bg-black/40 text-glow-magenta hover:scale-105" : locked ? "bg-black/40 text-muted-foreground" : "bg-black/40 text-glow-yellow hover:scale-105"}`}
                        >
                          {eq ? tr("equipped") : owned ? tr("equip") : s.passOnly ? "🏆 Pass" : s.chestOnly ? "🎁 Coffre" : `${tr("buy")} · ${s.price} 🪙`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {panel === "pass" && (
              <div>
                <div className="mb-3">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.2em]">
                    <span className="text-glow-cyan">{tr("tier")} {passTier}/{PASS_TIERS}</span>
                    <span className="text-glow-yellow">{prog.xp} XP</span>
                  </div>
                  <div className="mt-1 h-2 w-full rounded-full bg-black/40 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[color:var(--neon-cyan)] to-[color:var(--neon-magenta)]" style={{ width: `${passProgressPct}%` }} />
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground text-center">{tr("passTier100")}</div>
                </div>
                <div ref={passListRef} className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
                  {PASS_REWARDS.map((r, i) => {
                    const unlocked = i < passTier;
                    const claimed = prog.claimed.includes(i);
                    const isFinal = i === PASS_TIERS - 1;
                    const isCurrent = i === Math.min(passTier, PASS_TIERS - 1);
                    const label =
                      r.type === "coins" ? `${r.value} 🪙` :
                      r.type === "xp" ? `+${r.value} XP` :
                      r.type === "chest" ? `🎁 ×${r.value}` :
                      `✨ ${r.value}`;
                    return (
                      <div key={i} data-tier={i} className={`rounded-xl border p-3 text-center ${isFinal ? "border-[color:var(--neon-magenta)] bg-[color:var(--neon-magenta)]/10" : unlocked ? "border-[color:var(--neon-cyan)]/60 bg-[color:var(--neon-cyan)]/10" : "border-border/40 bg-black/20 opacity-60"} ${isCurrent ? "ring-2 ring-[color:var(--neon-yellow)]" : ""}`}>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          {tr("tier")} {i + 1}{isFinal ? ` · ${tr("exclusive")}` : ""}
                        </div>
                        <div className="mt-1 font-display text-sm font-bold text-glow-yellow">{label}</div>
                        <button onClick={() => claimTier(i)} disabled={!unlocked || claimed} className={`mt-2 w-full rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${claimed ? "bg-black/30 text-muted-foreground" : unlocked ? "bg-[color:var(--neon-magenta)]/20 text-glow-magenta hover:scale-105 transition" : "bg-black/30 text-muted-foreground"}`}>
                          {claimed ? tr("claimed") : unlocked ? tr("claim") : tr("locked")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {panel === "missions" && (
              <div className="space-y-4 max-h-[65vh] overflow-y-auto">
                {(["daily", "weekly"] as const).map((bucket) => (
                  <div key={bucket}>
                    <div className="mb-2 text-xs uppercase tracking-[0.3em] text-glow-cyan">{tr(bucket)}</div>
                    <div className="space-y-2">
                      {prog.missions[bucket].list.map((m) => {
                        const tpl = findTemplate(m.id); if (!tpl) return null;
                        const pct = Math.min(100, (m.progress / tpl.target) * 100);
                        const ready = m.progress >= tpl.target && !m.claimed;
                        return (
                          <div key={m.id} className="rounded-xl border border-border/50 bg-black/30 p-3">
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-xs font-bold uppercase tracking-widest text-glow-cyan">{tr(tpl.titleKey)}</div>
                              <div className="text-[10px] uppercase tracking-[0.2em] text-glow-yellow whitespace-nowrap">+{tpl.coins}🪙 · +{tpl.xp}XP</div>
                            </div>
                            <div className="mt-2 h-2 w-full rounded-full bg-black/40 overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-[color:var(--neon-cyan)] to-[color:var(--neon-magenta)]" style={{ width: `${pct}%` }} />
                            </div>
                            <div className="mt-1 flex items-center justify-between text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                              <span>{Math.floor(m.progress)}/{tpl.target}</span>
                              <button onClick={() => claimMission(m.id)} disabled={!ready} className={`rounded-lg px-2 py-1 font-bold ${m.claimed ? "bg-black/30 text-muted-foreground" : ready ? "bg-[color:var(--neon-magenta)]/20 text-glow-magenta hover:scale-105 transition" : "bg-black/30 text-muted-foreground"}`}>
                                {m.claimed ? tr("claimed") : ready ? tr("claim") : tr("locked")}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {panel === "leaderboard" && (
              <div>
                <div className="mb-3 grid grid-cols-3 gap-1 text-[10px] uppercase tracking-[0.2em]">
                  {MODES.map((m) => (
                    <button key={m.id} onClick={() => setLbMode(m.id)} className={`rounded-lg py-2 font-bold ${lbMode === m.id ? "bg-[color:var(--neon-cyan)]/20 text-glow-cyan" : "bg-black/30 text-muted-foreground"}`}>
                      {tr(m.nameKey)}
                    </button>
                  ))}
                </div>
                {!user && <div className="mb-2 text-center text-[10px] uppercase tracking-[0.2em] text-glow-magenta">{tr("signInToRank")}</div>}
                {myRank && (
                  <div className="mb-3 rounded-xl border border-[color:var(--neon-magenta)]/60 bg-[color:var(--neon-magenta)]/10 p-3 text-center">
                    <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{tr("myRank")}</div>
                    <div className="font-display text-2xl font-black text-glow-magenta">#{myRank.rank ?? "—"} <span className="text-sm text-muted-foreground">/ {myRank.total}</span></div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-glow-yellow">{myRank.score} pts</div>
                  </div>
                )}
                <div className="text-[10px] uppercase tracking-[0.2em] text-glow-cyan text-center mb-2">🌍 {tr("top100")} · <span className="text-glow-yellow">● {tr("liveUpdates")}</span></div>
                <div className="space-y-1 max-h-[45vh] overflow-y-auto">
                  {lbLoading && lbRows.length === 0 && <div className="text-center text-xs text-muted-foreground py-4">…</div>}
                  {lbRows.map((row, idx) => {
                    const isMe = user?.id === row.user_id;
                    return (
                      <div key={row.user_id} className={`flex items-center justify-between rounded-lg border px-3 py-2 ${isMe ? "border-[color:var(--neon-cyan)] bg-[color:var(--neon-cyan)]/10" : "border-border/40 bg-black/20"}`}>
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`font-display font-black text-sm w-8 ${idx === 0 ? "text-glow-yellow" : idx < 3 ? "text-glow-magenta" : "text-muted-foreground"}`}>#{idx + 1}</span>
                          <span className="text-xs font-bold uppercase tracking-widest truncate">{row.display_name || "Anon"}</span>
                        </div>
                        <span className="font-display font-black text-glow-cyan tabular-nums">{row.score}</span>
                      </div>
                    );
                  })}
                  {!lbLoading && lbRows.length === 0 && <div className="text-center text-xs text-muted-foreground py-4">—</div>}
                </div>
              </div>
            )}


            {panel === "ranked" && (
              <div className="space-y-2">
                <div className="text-center mb-2">
                  <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{tr("rank")}</div>
                  <div className="font-display text-3xl font-black" style={{ color: rank.color, textShadow: `0 0 20px ${rank.color}` }}>{rank.name}</div>
                </div>
                {[...Array(7)].map((_, i) => {
                  const r = ["Bronze","Silver","Gold","Platinum","Diamond","Master","Neon"][i];
                  const min = [0,500,1500,3500,7000,12000,20000][i];
                  const color = ["#c88a5c","#c8d0e0","#ffd76b","#7bf3ff","#c39bff","#ff7bd1","#a8ff5c"][i];
                  const achieved = Math.max(...Object.values(prog.bestByMode)) >= min;
                  return (
                    <div key={r} className={`flex items-center justify-between rounded-lg border p-3 ${achieved ? "border-[color:var(--neon-cyan)]/60 bg-[color:var(--neon-cyan)]/10" : "border-border/40 bg-black/20 opacity-60"}`}>
                      <span className="font-display font-bold uppercase tracking-widest" style={{ color }}>{r}</span>
                      <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">≥ {min}</span>
                    </div>
                  );
                })}
                <div className="mt-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground text-center">
                  {tr("best")}: {Math.max(...Object.values(prog.bestByMode))}
                </div>
              </div>
            )}

            {panel === "duo" && (
              <DuoLobby
                duo={duo}
                tr={tr}
                signedIn={!!user}
                code={duoCode}
                setCode={setDuoCode}
                onCopy={(c) => { navigator.clipboard?.writeText(c).catch(() => { /* noop */ }); showToast(tr("duoCopied")); }}
                teamRecord={prog.duoBest ?? 0}
                onClose={() => setPanel(null)}
              />
            )}

            {panel === "settings" && (
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">{tr("language")}</div>
                <div className="grid grid-cols-3 gap-2">
                  {LANGS.map((l) => (
                    <button key={l.code} onClick={() => setLang(l.code)} className={`rounded-xl border p-3 transition ${lang === l.code ? "border-[color:var(--neon-cyan)] bg-[color:var(--neon-cyan)]/10" : "border-border/50 bg-black/20 hover:border-[color:var(--neon-magenta)]"}`}>
                      <div className="text-2xl">{l.flag}</div>
                      <div className="mt-1 text-[11px] font-bold uppercase tracking-widest text-glow-cyan">{l.label}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-4 text-xs uppercase tracking-[0.2em] text-muted-foreground mb-2">{tr("sound")}</div>
                <button onClick={() => setMuted(m => !m)} className="w-full panel-neon rounded-lg py-2 text-xs uppercase tracking-widest text-glow-yellow">
                  {muted ? `🔇 ${tr("muted")}` : `🔊 ${tr("sound")}`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
