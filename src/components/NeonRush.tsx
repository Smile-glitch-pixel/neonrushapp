import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LANGS, type Lang, t } from "@/lib/i18n";
import {
  MODES, SKINS, PASS_TIERS, PASS_XP_PER_TIER, PASS_REWARDS, rankFor,
  loadProg, saveProg, type GameMode, type Progression, type SkinId,
} from "@/lib/neon-progression";

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
  dispose() { if (this.musicTimer) clearInterval(this.musicTimer); this.musicTimer = null; this.ctx?.close(); this.ctx = null; this.started = false; }
}

/* ----------------------------- Types ----------------------------- */
type Vec = { x: number; y: number };
type Entity = Vec & {
  vx: number; vy: number; r: number; life: number; maxLife: number;
  kind: "orb" | "hazard" | "power" | "particle";
  color: string;
  power?: "shield" | "slow" | "magnet" | "x2";
  angle?: number; spin?: number;
};
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dist2 = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

const LANG_KEY = "neon-rush-lang";

/* ----------------------------- Component ----------------------------- */
export default function NeonRush() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioEngine>(new AudioEngine());

  const [lang, setLang] = useState<Lang>("fr");
  const [prog, setProg] = useState<Progression>(() => ({ coins: 0, xp: 0, claimed: [], owned: ["cyan"], equipped: "cyan", bestByMode: { classic: 0, hardcore: 0, zen: 0, blitz: 0 } }));
  const [mode, setMode] = useState<GameMode>("classic");
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [muted, setMuted] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [rewardEarned, setRewardEarned] = useState<{ coins: number; xp: number; skin?: SkinId } | null>(null);
  const [toast, setToast] = useState<string>("");
  const [panel, setPanel] = useState<null | "modes" | "skins" | "pass" | "ranked" | "settings">(null);
  const [powers, setPowers] = useState<{ shield: number; slow: number; magnet: number; x2: number }>({ shield: 0, slow: 0, magnet: 0, x2: 0 });

  // Hydration-safe: load lang and prog after mount
  useEffect(() => {
    const l = (localStorage.getItem(LANG_KEY) as Lang) || (navigator.language.startsWith("es") ? "es" : navigator.language.startsWith("fr") ? "fr" : "en");
    setLang(l);
    setProg(loadProg());
  }, []);
  useEffect(() => { try { localStorage.setItem(LANG_KEY, lang); } catch { /* noop */ } }, [lang]);
  useEffect(() => { saveProg(prog); }, [prog]);

  const tr = useCallback((k: string) => t(lang, k), [lang]);

  const equippedSkin = SKINS.find((s) => s.id === prog.equipped) || SKINS[0];
  const best = prog.bestByMode[mode] || 0;
  const rank = rankFor(Math.max(...Object.values(prog.bestByMode)));

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 2200); };

  // Game state
  const stateRef = useRef({
    player: { x: 0, y: 0, r: 14, tx: 0, ty: 0, trail: [] as Vec[] },
    entities: [] as Entity[], particles: [] as Entity[],
    t: 0, lastSpawn: 0, lastPower: 0, shake: 0,
    combo: 0, comboTimer: 0, score: 0,
    powers: { shield: 0, slow: 0, magnet: 0, x2: 0 },
    dpr: 1, w: 0, h: 0, over: false, running: false, difficulty: 1,
    mode: "classic" as GameMode,
    skinColors: equippedSkin.colors as [string, string, string],
    duration: 0, // ms, 0 = infinite
  });

  const start = useCallback(async (m: GameMode) => {
    await audioRef.current.start();
    const s = stateRef.current;
    s.entities = []; s.particles = [];
    s.player.x = s.w / 2; s.player.y = s.h / 2;
    s.player.tx = s.player.x; s.player.ty = s.player.y; s.player.trail = [];
    s.t = 0; s.lastSpawn = 0; s.lastPower = 0;
    s.combo = 0; s.comboTimer = 0; s.score = 0; s.shake = 0;
    s.powers = { shield: 0, slow: 0, magnet: 0, x2: 0 };
    s.over = false; s.running = true; s.difficulty = m === "hardcore" ? 1.5 : 1;
    s.mode = m;
    s.skinColors = (SKINS.find((k) => k.id === prog.equipped) || SKINS[0]).colors as [string, string, string];
    s.duration = m === "blitz" ? 60000 : 0;
    setMode(m); setScore(0); setCombo(0);
    setPowers({ shield: 0, slow: 0, magnet: 0, x2: 0 });
    setTimeLeft(m === "blitz" ? 60 : 0);
    setGameOver(false); setRunning(true); setPanel(null); setRewardEarned(null);
  }, [prog.equipped]);

  // Input
  useEffect(() => {
    const canvas = canvasRef.current!;
    const s = stateRef.current;
    const onMove = (x: number, y: number) => {
      const rect = canvas.getBoundingClientRect();
      s.player.tx = ((x - rect.left) / rect.width) * s.w;
      s.player.ty = ((y - rect.top) / rect.height) * s.h;
    };
    const mm = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const tm = (e: TouchEvent) => { if (e.touches[0]) { onMove(e.touches[0].clientX, e.touches[0].clientY); e.preventDefault(); } };
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
    canvas.addEventListener("mousemove", mm);
    canvas.addEventListener("touchmove", tm, { passive: false });
    canvas.addEventListener("touchstart", tm, { passive: false });
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("mousemove", mm);
      canvas.removeEventListener("touchmove", tm);
      canvas.removeEventListener("touchstart", tm);
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

  // End-of-run rewards
  const finishRun = useCallback((finalScore: number) => {
    const earnedCoins = Math.floor(finalScore / 10);
    const earnedXP = Math.floor(finalScore / 6);
    // Random skin drop chance based on score (max ~25%)
    const dropChance = Math.min(0.25, finalScore / 20000);
    let droppedSkin: SkinId | undefined;
    if (Math.random() < dropChance) {
      const unowned = SKINS.filter((s) => s.rarity !== "legendary");
      const pick = unowned[Math.floor(Math.random() * unowned.length)];
      if (pick) droppedSkin = pick.id;
    }
    setProg((p) => {
      const owned = droppedSkin && !p.owned.includes(droppedSkin) ? [...p.owned, droppedSkin] : p.owned;
      const bestByMode = { ...p.bestByMode, [mode]: Math.max(p.bestByMode[mode] || 0, finalScore) };
      return { ...p, coins: p.coins + earnedCoins, xp: p.xp + earnedXP, owned, bestByMode };
    });
    setRewardEarned({ coins: earnedCoins, xp: earnedXP, skin: droppedSkin && !prog.owned.includes(droppedSkin) ? droppedSkin : undefined });
    if (droppedSkin && !prog.owned.includes(droppedSkin)) showToast(`${t(lang, "newSkin")} ${SKINS.find((s) => s.id === droppedSkin)?.name}`);
  }, [mode, prog.owned, lang]);

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
      const hazardChance = s.mode === "zen" ? 0 : s.mode === "hardcore" ? 0.55 : 0.42;
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
      if (s.mode === "hardcore") return;
      const kinds: Array<"shield" | "slow" | "magnet" | "x2"> = ["shield", "slow", "magnet", "x2"];
      const power = kinds[Math.floor(Math.random() * kinds.length)];
      s.entities.push({ x: rand(60, s.w - 60), y: rand(60, s.h - 60), vx: 0, vy: 0, r: 14, life: 0, maxLife: 8000, kind: "power", color: "#fff17a", power, angle: 0, spin: 0.03 });
    };
    const burst = (x: number, y: number, color: string, count = 24, force = 1) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(1, 6) * force;
        s.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: rand(1, 3), life: 0, maxLife: rand(400, 900), kind: "particle", color });
      }
    };
    const gameOverNow = () => {
      s.over = true; s.running = false;
      audioRef.current.gameover();
      const fs = Math.floor(s.score);
      setScore(fs); setGameOver(true); setRunning(false);
      finishRun(fs);
    };

    const loop = (now: number) => {
      const dt = Math.min(48, now - last); last = now;
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
        const spawnRate = Math.max(220, 700 - s.t * 0.05);
        if (s.t - s.lastSpawn > spawnRate) {
          spawn(); if (Math.random() < 0.25 * s.difficulty) spawn(); s.lastSpawn = s.t;
        }
        if (s.mode !== "hardcore" && s.t - s.lastPower > 9000) { spawnPower(); s.lastPower = s.t; }

        s.player.x += (s.player.tx - s.player.x) * 0.22;
        s.player.y += (s.player.ty - s.player.y) * 0.22;
        s.player.x = Math.max(s.player.r, Math.min(s.w - s.player.r, s.player.x));
        s.player.y = Math.max(s.player.r, Math.min(s.h - s.player.r, s.player.y));
        s.player.trail.push({ x: s.player.x, y: s.player.y });
        if (s.player.trail.length > 22) s.player.trail.shift();

        (Object.keys(s.powers) as Array<keyof typeof s.powers>).forEach((k) => { s.powers[k] = Math.max(0, s.powers[k] - dt); });
        s.comboTimer = Math.max(0, s.comboTimer - dt);
        if (s.comboTimer === 0 && s.combo > 0) s.combo = 0;

        const slowFactor = s.powers.slow > 0 ? 0.35 : 1;
        const magnetR = s.powers.magnet > 0 ? 180 : 0;

        for (let i = s.entities.length - 1; i >= 0; i--) {
          const e = s.entities[i];
          if (e.kind === "power") {
            e.life += dt; e.angle = (e.angle || 0) + (e.spin || 0);
            if (e.life > e.maxLife) { s.entities.splice(i, 1); continue; }
          } else {
            if (magnetR && e.kind === "orb") {
              const dx = s.player.x - e.x, dy = s.player.y - e.y;
              const d = Math.hypot(dx, dy);
              if (d < magnetR) { e.vx += (dx / d) * 0.4; e.vy += (dy / d) * 0.4; }
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
              const mul = s.powers.x2 > 0 ? 2 : 1;
              const gain = (10 + s.combo * 2) * mul;
              s.score += gain; setScore(Math.floor(s.score)); setCombo(s.combo);
              audioRef.current.pickup(s.combo);
              burst(e.x, e.y, "#7bf3ff", 18, 1);
              s.entities.splice(i, 1);
            } else if (e.kind === "power" && e.power) {
              s.powers[e.power] = 6000; setPowers({ ...s.powers });
              audioRef.current.power(); burst(e.x, e.y, "#fff17a", 40, 1.4);
              s.entities.splice(i, 1);
            } else if (e.kind === "hazard") {
              if (s.powers.shield > 0) {
                s.powers.shield = 0; setPowers({ ...s.powers });
                burst(e.x, e.y, "#a0ffea", 40, 1.6); s.shake = 14;
                audioRef.current.power(); s.entities.splice(i, 1);
              } else {
                burst(s.player.x, s.player.y, "#ff2e6a", 80, 2.2);
                s.shake = 28; audioRef.current.hit(); gameOverNow();
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

      ctx.globalCompositeOperation = "lighter";
      for (let i = 0; i < s.player.trail.length; i++) {
        const tt = s.player.trail[i]; const a = i / s.player.trail.length;
        ctx.beginPath();
        ctx.fillStyle = `rgba(200, 200, 255, ${a * 0.35})`;
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
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, e.r * 2.4);
          g.addColorStop(0, "rgba(255,80,140,0.95)"); g.addColorStop(1, "rgba(255,46,106,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, e.r * 2.4, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = "#ff2e6a"; ctx.lineWidth = 2; ctx.beginPath();
          const spikes = 8;
          for (let k = 0; k < spikes * 2; k++) {
            const rr = k % 2 === 0 ? e.r : e.r * 0.55;
            const a = (k / (spikes * 2)) * Math.PI * 2;
            const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
            if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath(); ctx.stroke();
        } else if (e.kind === "power") {
          const colors: Record<string, string> = { shield: "#a0ffea", slow: "#c39bff", magnet: "#ffb36b", x2: "#fff17a" };
          const c = colors[e.power!] || "#fff17a";
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
          const label: Record<string, string> = { shield: "S", slow: "T", magnet: "M", x2: "×2" };
          ctx.fillText(label[e.power!] || "?", 0, 1);
        }
        ctx.restore();
      }
      for (const p of s.particles) {
        const a = 1 - p.life / p.maxLife;
        ctx.fillStyle = p.color; ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
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
      const pg = ctx.createRadialGradient(s.player.x, s.player.y, 0, s.player.x, s.player.y, pr * 3);
      pg.addColorStop(0, c0); pg.addColorStop(0.3, c1); pg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(s.player.x, s.player.y, pr * 3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(s.player.x, s.player.y, pr * 0.9, 0, Math.PI * 2); ctx.fill();
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

  const claimTier = (i: number) => {
    if (i >= passTier || prog.claimed.includes(i)) return;
    const reward = PASS_REWARDS[i];
    setProg((p) => {
      let np = { ...p, claimed: [...p.claimed, i] };
      if (reward.type === "coins") np = { ...np, coins: np.coins + (reward.value as number) };
      else {
        const sk = reward.value as SkinId;
        if (!np.owned.includes(sk)) np = { ...np, owned: [...np.owned, sk] };
      }
      return np;
    });
    showToast(tr("claimed"));
  };

  const buySkin = (id: SkinId) => {
    const sk = SKINS.find((s) => s.id === id)!;
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
    if (prog.coins < 250) { showToast(tr("notEnough")); return; }
    const unowned = SKINS.filter((s) => !prog.owned.includes(s.id));
    setProg((p) => {
      let np = { ...p, coins: p.coins - 250 };
      if (unowned.length > 0 && Math.random() < 0.6) {
        const pick = unowned[Math.floor(Math.random() * unowned.length)];
        np = { ...np, owned: [...np.owned, pick.id] };
        showToast(`${tr("newSkin")} ${pick.name}`);
      } else {
        const bonus = 100 + Math.floor(Math.random() * 300);
        np = { ...np, coins: np.coins + bonus };
        showToast(`+${bonus} ${tr("coins")}`);
      }
      return np;
    });
  };

  const activePowers = (Object.keys(powers) as Array<keyof typeof powers>).filter((k) => powers[k] > 0);
  const powerKeyMap: Record<string, string> = { shield: "shield", slow: "slow", magnet: "magnet", x2: "x2" };
  const powerColor: Record<string, string> = { shield: "text-glow-cyan", slow: "text-glow-magenta", magnet: "text-glow-yellow", x2: "text-glow-yellow" };

  const currentModeName = useMemo(() => tr(MODES.find(m => m.id === mode)!.nameKey), [mode, tr]);

  return (
    <main className="scanlines relative h-screen w-screen overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="scanlines-overlay" />

      {/* HUD */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3 sm:p-6">
        <div className="panel-neon pointer-events-auto rounded-xl px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{tr("score")}</div>
          <div className="font-display text-3xl font-black text-glow-cyan tabular-nums">{score}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {tr("best")} : <span className="text-glow-yellow">{best}</span>
          </div>
          {running && mode === "blitz" && (
            <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {tr("time")} : <span className="text-glow-magenta">{timeLeft}s</span>
            </div>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          <button onClick={() => setMuted((m) => !m)} className="panel-neon pointer-events-auto rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest text-glow-cyan transition hover:scale-105">
            {muted ? `🔇 ${tr("muted")}` : `🔊 ${tr("sound")}`}
          </button>
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
              <button onClick={() => setPanel("ranked")} className="panel-neon rounded-lg py-2 text-glow-cyan hover:scale-105 transition">{tr("ranked")}</button>
              <button onClick={() => setPanel("settings")} className="panel-neon rounded-lg py-2 text-glow-magenta hover:scale-105 transition col-span-2 sm:col-span-1">{tr("settings")}</button>
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
              </div>
            )}

            {panel === "skins" && (
              <div>
                <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.2em]">
                  <span className="text-glow-yellow">🪙 {prog.coins}</span>
                  <button onClick={openChest} className="panel-neon rounded-lg px-3 py-1 text-glow-magenta hover:scale-105 transition">🎁 {tr("openChest")} · 250</button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {SKINS.map((s) => {
                    const owned = prog.owned.includes(s.id);
                    const eq = prog.equipped === s.id;
                    return (
                      <div key={s.id} className="rounded-xl border border-border/50 bg-black/30 p-3">
                        <div className="mx-auto h-12 w-12 rounded-full" style={{ background: `radial-gradient(circle at 30% 30%, ${s.colors[0]}, ${s.colors[1]} 50%, ${s.colors[2]})`, boxShadow: `0 0 20px ${s.colors[1]}` }} />
                        <div className="mt-2 text-center text-xs font-bold uppercase tracking-widest">{s.name}</div>
                        <div className="text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{s.rarity}</div>
                        <button
                          onClick={() => (owned ? equipSkin(s.id) : buySkin(s.id))}
                          disabled={eq}
                          className={`mt-2 w-full rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-widest transition ${eq ? "bg-[color:var(--neon-cyan)]/20 text-glow-cyan" : owned ? "bg-black/40 text-glow-magenta hover:scale-105" : "bg-black/40 text-glow-yellow hover:scale-105"}`}
                        >
                          {eq ? tr("equipped") : owned ? tr("equip") : `${tr("buy")} · ${s.price} 🪙`}
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
                </div>
                <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto">
                  {PASS_REWARDS.map((r, i) => {
                    const unlocked = i < passTier;
                    const claimed = prog.claimed.includes(i);
                    return (
                      <div key={i} className={`rounded-xl border p-3 text-center ${unlocked ? "border-[color:var(--neon-cyan)]/60 bg-[color:var(--neon-cyan)]/10" : "border-border/40 bg-black/20 opacity-60"}`}>
                        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{tr("tier")} {i + 1}</div>
                        <div className="mt-1 font-display text-sm font-bold text-glow-yellow">
                          {r.type === "coins" ? `${r.value} 🪙` : `✨ ${r.value}`}
                        </div>
                        <button onClick={() => claimTier(i)} disabled={!unlocked || claimed} className={`mt-2 w-full rounded-lg px-2 py-1 text-[10px] font-bold uppercase tracking-widest ${claimed ? "bg-black/30 text-muted-foreground" : unlocked ? "bg-[color:var(--neon-magenta)]/20 text-glow-magenta hover:scale-105 transition" : "bg-black/30 text-muted-foreground"}`}>
                          {claimed ? tr("claimed") : unlocked ? tr("claim") : tr("locked")}
                        </button>
                      </div>
                    );
                  })}
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
