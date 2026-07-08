import { useCallback, useEffect, useRef, useState } from "react";

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
      (window as unknown as { AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ||
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
    if (!this.started) {
      this.started = true;
      this.scheduleMusic();
    }
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.7;
  }

  private scheduleMusic() {
    if (!this.ctx || !this.musicGain) return;
    const scale = [0, 3, 5, 7, 10, 12, 15]; // minor pentatonic-ish
    const root = 55; // A1
    const tick = () => {
      if (!this.ctx || !this.musicGain) return;
      const t = this.ctx.currentTime;
      // Bass pulse
      this.playTone({
        freq: root * Math.pow(2, scale[this.step % scale.length] / 12) / 2,
        dur: 0.28,
        type: "sawtooth",
        gain: 0.25,
        dest: this.musicGain,
        at: t,
        filter: 500,
      });
      // Sparkle on every other step
      if (this.step % 2 === 0) {
        const n = scale[(this.step * 3 + 2) % scale.length];
        this.playTone({
          freq: root * 4 * Math.pow(2, n / 12),
          dur: 0.18,
          type: "triangle",
          gain: 0.08,
          dest: this.musicGain,
          at: t + 0.06,
        });
      }
      // Hi-hat
      this.noiseHit(0.03, 0.04, this.musicGain, t + 0.12);
      this.step++;
    };
    tick();
    this.musicTimer = window.setInterval(tick, 260);
  }

  private playTone(o: {
    freq: number;
    dur: number;
    type?: OscillatorType;
    gain?: number;
    dest?: AudioNode;
    at?: number;
    filter?: number;
    slideTo?: number;
  }) {
    if (!this.ctx) return;
    const t = o.at ?? this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(o.freq, t);
    if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slideTo), t + o.dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(o.gain ?? 0.2, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    let node: AudioNode = osc;
    if (o.filter) {
      const f = this.ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.filter;
      osc.connect(f);
      f.connect(g);
      node = f;
    } else {
      osc.connect(g);
    }
    g.connect(o.dest ?? this.sfxGain ?? this.master!);
    osc.start(t);
    osc.stop(t + o.dur + 0.02);
    void node;
  }

  private noiseHit(dur: number, gain: number, dest: AudioNode, at?: number) {
    if (!this.ctx) return;
    const t = at ?? this.ctx.currentTime;
    const buffer = this.ctx.createBuffer(1, Math.floor(this.ctx.sampleRate * dur), this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 6000;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(hp);
    hp.connect(g);
    g.connect(dest);
    src.start(t);
  }

  pickup(combo: number) {
    if (!this.ctx) return;
    const base = 660 + Math.min(combo, 20) * 40;
    this.playTone({ freq: base, dur: 0.12, type: "triangle", gain: 0.25 });
    this.playTone({ freq: base * 1.5, dur: 0.14, type: "sine", gain: 0.18, at: this.ctx.currentTime + 0.02 });
  }
  power() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      this.playTone({ freq: 300 + i * 180, dur: 0.09, type: "square", gain: 0.15, at: t + i * 0.04 });
    }
  }
  hit() {
    if (!this.ctx) return;
    this.playTone({ freq: 220, dur: 0.35, type: "sawtooth", gain: 0.35, slideTo: 55, filter: 900 });
    this.noiseHit(0.25, 0.4, this.sfxGain ?? this.master!);
  }
  gameover() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [440, 330, 262, 196].forEach((f, i) =>
      this.playTone({ freq: f, dur: 0.35, type: "sawtooth", gain: 0.25, at: t + i * 0.12 })
    );
  }
  dispose() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    this.ctx?.close();
    this.ctx = null;
    this.started = false;
  }
}

/* ----------------------------- Game Types ----------------------------- */
type Vec = { x: number; y: number };
type Entity = Vec & {
  vx: number;
  vy: number;
  r: number;
  life: number;
  maxLife: number;
  kind: "orb" | "hazard" | "power" | "particle";
  color: string;
  power?: "shield" | "slow" | "magnet" | "x2";
  hue?: number;
  spin?: number;
  angle?: number;
};

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const dist2 = (a: Vec, b: Vec) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;

/* ----------------------------- Game Component ----------------------------- */
export default function NeonRush() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audioRef = useRef<AudioEngine>(new AudioEngine());
  const [running, setRunning] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [combo, setCombo] = useState(0);
  const [muted, setMuted] = useState(false);
  const [powers, setPowers] = useState<{ shield: number; slow: number; magnet: number; x2: number }>({
    shield: 0,
    slow: 0,
    magnet: 0,
    x2: 0,
  });

  // Mutable game state (not React state to avoid re-render)
  const stateRef = useRef({
    player: { x: 0, y: 0, r: 14, tx: 0, ty: 0, trail: [] as Vec[] },
    entities: [] as Entity[],
    particles: [] as Entity[],
    t: 0,
    lastSpawn: 0,
    lastPower: 0,
    shake: 0,
    combo: 0,
    comboTimer: 0,
    score: 0,
    powers: { shield: 0, slow: 0, magnet: 0, x2: 0 },
    dpr: 1,
    w: 0,
    h: 0,
    over: false,
    running: false,
    difficulty: 1,
  });

  useEffect(() => {
    const b = Number(localStorage.getItem("neon-rush-best") || 0);
    setBest(b);
  }, []);

  const start = useCallback(async () => {
    await audioRef.current.start();
    const s = stateRef.current;
    s.entities = [];
    s.particles = [];
    s.player.x = s.w / 2;
    s.player.y = s.h / 2;
    s.player.tx = s.player.x;
    s.player.ty = s.player.y;
    s.player.trail = [];
    s.t = 0;
    s.lastSpawn = 0;
    s.lastPower = 0;
    s.combo = 0;
    s.comboTimer = 0;
    s.score = 0;
    s.shake = 0;
    s.powers = { shield: 0, slow: 0, magnet: 0, x2: 0 };
    s.over = false;
    s.running = true;
    s.difficulty = 1;
    setScore(0);
    setCombo(0);
    setPowers({ shield: 0, slow: 0, magnet: 0, x2: 0 });
    setGameOver(false);
    setRunning(true);
  }, []);

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
    const tm = (e: TouchEvent) => {
      if (e.touches[0]) {
        onMove(e.touches[0].clientX, e.touches[0].clientY);
        e.preventDefault();
      }
    };
    const keys: Record<string, boolean> = {};
    const kd = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = true;
    };
    const ku = (e: KeyboardEvent) => {
      keys[e.key.toLowerCase()] = false;
    };
    const kbLoop = () => {
      const speed = 8;
      if (keys["arrowleft"] || keys["a"]) s.player.tx -= speed;
      if (keys["arrowright"] || keys["d"]) s.player.tx += speed;
      if (keys["arrowup"] || keys["w"]) s.player.ty -= speed;
      if (keys["arrowdown"] || keys["s"]) s.player.ty += speed;
      requestAnimationFrame(kbLoop);
    };
    kbLoop();
    canvas.addEventListener("mousemove", mm);
    canvas.addEventListener("touchmove", tm, { passive: false });
    canvas.addEventListener("touchstart", tm, { passive: false });
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
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
      s.dpr = dpr;
      s.w = canvas.clientWidth;
      s.h = canvas.clientHeight;
      canvas.width = s.w * dpr;
      canvas.height = s.h * dpr;
      const ctx = canvas.getContext("2d")!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (s.player.x === 0 && s.player.y === 0) {
        s.player.x = s.w / 2;
        s.player.y = s.h / 2;
        s.player.tx = s.player.x;
        s.player.ty = s.player.y;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  // Main loop
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const s = stateRef.current;
    let raf = 0;
    let last = performance.now();

    const spawn = () => {
      const edge = Math.floor(Math.random() * 4);
      let x = 0,
        y = 0;
      if (edge === 0) {
        x = -20;
        y = Math.random() * s.h;
      } else if (edge === 1) {
        x = s.w + 20;
        y = Math.random() * s.h;
      } else if (edge === 2) {
        x = Math.random() * s.w;
        y = -20;
      } else {
        x = Math.random() * s.w;
        y = s.h + 20;
      }
      const towards = { x: s.w / 2 + rand(-100, 100), y: s.h / 2 + rand(-100, 100) };
      const dx = towards.x - x;
      const dy = towards.y - y;
      const len = Math.hypot(dx, dy) || 1;
      const speed = rand(1.2, 2.4) * s.difficulty;
      const isHazard = Math.random() < 0.42;
      s.entities.push({
        x,
        y,
        vx: (dx / len) * speed,
        vy: (dy / len) * speed,
        r: isHazard ? rand(14, 26) : rand(7, 11),
        life: 0,
        maxLife: 0,
        kind: isHazard ? "hazard" : "orb",
        color: isHazard ? "#ff2e6a" : "#7bf3ff",
        angle: rand(0, Math.PI * 2),
        spin: rand(-0.05, 0.05),
      });
    };

    const spawnPower = () => {
      const kinds: Array<"shield" | "slow" | "magnet" | "x2"> = ["shield", "slow", "magnet", "x2"];
      const power = kinds[Math.floor(Math.random() * kinds.length)];
      s.entities.push({
        x: rand(60, s.w - 60),
        y: rand(60, s.h - 60),
        vx: 0,
        vy: 0,
        r: 14,
        life: 0,
        maxLife: 8000,
        kind: "power",
        color: "#fff17a",
        power,
        angle: 0,
        spin: 0.03,
      });
    };

    const burst = (x: number, y: number, color: string, count = 24, force = 1) => {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = rand(1, 6) * force;
        s.particles.push({
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          r: rand(1, 3),
          life: 0,
          maxLife: rand(400, 900),
          kind: "particle",
          color,
        });
      }
    };

    const gameOverNow = () => {
      s.over = true;
      s.running = false;
      audioRef.current.gameover();
      const finalScore = Math.floor(s.score);
      setScore(finalScore);
      setGameOver(true);
      setRunning(false);
      setBest((prev) => {
        const nb = Math.max(prev, finalScore);
        localStorage.setItem("neon-rush-best", String(nb));
        return nb;
      });
    };

    const loop = (now: number) => {
      const dt = Math.min(48, now - last);
      last = now;

      // Background
      ctx.fillStyle = "rgba(10, 8, 22, 0.35)";
      ctx.fillRect(0, 0, s.w, s.h);

      // Grid
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = "#3a1b6a";
      ctx.lineWidth = 1;
      const gs = 40;
      const off = (s.t * 0.03) % gs;
      for (let x = -off; x < s.w; x += gs) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, s.h);
        ctx.stroke();
      }
      for (let y = -off; y < s.h; y += gs) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(s.w, y);
        ctx.stroke();
      }
      ctx.restore();

      // Shake
      if (s.shake > 0) {
        const sx = rand(-s.shake, s.shake);
        const sy = rand(-s.shake, s.shake);
        ctx.save();
        ctx.translate(sx, sy);
        s.shake *= 0.88;
      }

      if (s.running) {
        s.t += dt;
        s.difficulty = 1 + Math.min(2.5, s.t / 30000);

        // Spawns
        const spawnRate = Math.max(220, 700 - s.t * 0.05);
        if (s.t - s.lastSpawn > spawnRate) {
          spawn();
          if (Math.random() < 0.25 * s.difficulty) spawn();
          s.lastSpawn = s.t;
        }
        if (s.t - s.lastPower > 9000) {
          spawnPower();
          s.lastPower = s.t;
        }

        // Player follow
        s.player.x += (s.player.tx - s.player.x) * 0.22;
        s.player.y += (s.player.ty - s.player.y) * 0.22;
        s.player.x = Math.max(s.player.r, Math.min(s.w - s.player.r, s.player.x));
        s.player.y = Math.max(s.player.r, Math.min(s.h - s.player.r, s.player.y));
        s.player.trail.push({ x: s.player.x, y: s.player.y });
        if (s.player.trail.length > 22) s.player.trail.shift();

        // Powers timers
        (Object.keys(s.powers) as Array<keyof typeof s.powers>).forEach((k) => {
          s.powers[k] = Math.max(0, s.powers[k] - dt);
        });

        // Combo timer
        s.comboTimer = Math.max(0, s.comboTimer - dt);
        if (s.comboTimer === 0 && s.combo > 0) s.combo = 0;

        const slowFactor = s.powers.slow > 0 ? 0.35 : 1;
        const magnetR = s.powers.magnet > 0 ? 180 : 0;

        // Update entities
        for (let i = s.entities.length - 1; i >= 0; i--) {
          const e = s.entities[i];
          if (e.kind === "power") {
            e.life += dt;
            e.angle = (e.angle || 0) + (e.spin || 0);
            if (e.life > e.maxLife) {
              s.entities.splice(i, 1);
              continue;
            }
          } else {
            // magnet on orbs
            if (magnetR && e.kind === "orb") {
              const dx = s.player.x - e.x;
              const dy = s.player.y - e.y;
              const d = Math.hypot(dx, dy);
              if (d < magnetR) {
                e.vx += (dx / d) * 0.4;
                e.vy += (dy / d) * 0.4;
              }
            }
            e.x += e.vx * slowFactor * (dt / 16);
            e.y += e.vy * slowFactor * (dt / 16);
            e.angle = (e.angle || 0) + (e.spin || 0);
            if (e.x < -60 || e.x > s.w + 60 || e.y < -60 || e.y > s.h + 60) {
              s.entities.splice(i, 1);
              continue;
            }
          }

          // Collision
          const rr = (e.r + s.player.r) ** 2;
          if (dist2(e, s.player) < rr) {
            if (e.kind === "orb") {
              s.combo++;
              s.comboTimer = 1800;
              const mul = s.powers.x2 > 0 ? 2 : 1;
              const gain = (10 + s.combo * 2) * mul;
              s.score += gain;
              setScore(Math.floor(s.score));
              setCombo(s.combo);
              audioRef.current.pickup(s.combo);
              burst(e.x, e.y, "#7bf3ff", 18, 1);
              s.entities.splice(i, 1);
            } else if (e.kind === "power" && e.power) {
              s.powers[e.power] = 6000;
              setPowers({ ...s.powers });
              audioRef.current.power();
              burst(e.x, e.y, "#fff17a", 40, 1.4);
              s.entities.splice(i, 1);
            } else if (e.kind === "hazard") {
              if (s.powers.shield > 0) {
                s.powers.shield = 0;
                setPowers({ ...s.powers });
                burst(e.x, e.y, "#a0ffea", 40, 1.6);
                s.shake = 14;
                audioRef.current.power();
                s.entities.splice(i, 1);
              } else {
                burst(s.player.x, s.player.y, "#ff2e6a", 80, 2.2);
                s.shake = 28;
                audioRef.current.hit();
                gameOverNow();
              }
            }
          }
        }

        // Update particles
        for (let i = s.particles.length - 1; i >= 0; i--) {
          const p = s.particles[i];
          p.life += dt;
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.97;
          p.vy *= 0.97;
          if (p.life > p.maxLife) s.particles.splice(i, 1);
        }
      }

      // ---- Draw ----
      ctx.globalCompositeOperation = "lighter";

      // Trail
      for (let i = 0; i < s.player.trail.length; i++) {
        const t = s.player.trail[i];
        const a = i / s.player.trail.length;
        ctx.beginPath();
        ctx.fillStyle = `rgba(123, 243, 255, ${a * 0.35})`;
        ctx.arc(t.x, t.y, s.player.r * (0.3 + a * 0.9), 0, Math.PI * 2);
        ctx.fill();
      }

      // Entities
      for (const e of s.entities) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.rotate(e.angle || 0);
        if (e.kind === "orb") {
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, e.r * 3);
          g.addColorStop(0, "rgba(160,255,255,1)");
          g.addColorStop(0.4, "rgba(123,243,255,0.7)");
          g.addColorStop(1, "rgba(123,243,255,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, e.r * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#eaffff";
          ctx.beginPath();
          ctx.arc(0, 0, e.r * 0.7, 0, Math.PI * 2);
          ctx.fill();
        } else if (e.kind === "hazard") {
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, e.r * 2.4);
          g.addColorStop(0, "rgba(255,80,140,0.95)");
          g.addColorStop(1, "rgba(255,46,106,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, e.r * 2.4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "#ff2e6a";
          ctx.lineWidth = 2;
          ctx.beginPath();
          const spikes = 8;
          for (let k = 0; k < spikes * 2; k++) {
            const rr = k % 2 === 0 ? e.r : e.r * 0.55;
            const a = (k / (spikes * 2)) * Math.PI * 2;
            const px = Math.cos(a) * rr;
            const py = Math.sin(a) * rr;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        } else if (e.kind === "power") {
          const colors: Record<string, string> = {
            shield: "#a0ffea",
            slow: "#c39bff",
            magnet: "#ffb36b",
            x2: "#fff17a",
          };
          const c = colors[e.power!] || "#fff17a";
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, e.r * 3);
          g.addColorStop(0, c);
          g.addColorStop(1, "rgba(0,0,0,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(0, 0, e.r * 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = c;
          ctx.lineWidth = 2;
          ctx.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            const px = Math.cos(a) * e.r;
            const py = Math.sin(a) * e.r;
            if (k === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.fillStyle = "#0b0620";
          ctx.font = "bold 12px Orbitron, sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const label: Record<string, string> = { shield: "S", slow: "T", magnet: "M", x2: "×2" };
          ctx.fillText(label[e.power!] || "?", 0, 1);
        }
        ctx.restore();
      }

      // Particles
      for (const p of s.particles) {
        const a = 1 - p.life / p.maxLife;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // Player
      const pr = s.player.r;
      const hasShield = s.powers.shield > 0;
      if (hasShield) {
        ctx.strokeStyle = "rgba(160,255,234,0.9)";
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(s.player.x, s.player.y, pr + 10 + Math.sin(s.t / 100) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      const pg = ctx.createRadialGradient(s.player.x, s.player.y, 0, s.player.x, s.player.y, pr * 3);
      pg.addColorStop(0, "rgba(255,255,255,1)");
      pg.addColorStop(0.3, "rgba(200,140,255,0.8)");
      pg.addColorStop(1, "rgba(160,80,255,0)");
      ctx.fillStyle = pg;
      ctx.beginPath();
      ctx.arc(s.player.x, s.player.y, pr * 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(s.player.x, s.player.y, pr * 0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = "source-over";
      if (s.shake > 0) ctx.restore();

      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    audioRef.current.setMuted(muted);
  }, [muted]);

  const share = async () => {
    const text = `J'ai fait ${score} points dans NEON RUSH 🎮✨ tu bats ça ?`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "NEON RUSH", text, url: window.location.href });
      } catch {
        /* noop */
      }
    } else {
      await navigator.clipboard.writeText(`${text} ${window.location.href}`);
    }
  };

  const activePowers = (Object.keys(powers) as Array<keyof typeof powers>).filter((k) => powers[k] > 0);
  const powerLabel: Record<string, string> = {
    shield: "BOUCLIER",
    slow: "TEMPS RALENTI",
    magnet: "AIMANT",
    x2: "SCORE ×2",
  };
  const powerColor: Record<string, string> = {
    shield: "text-glow-cyan",
    slow: "text-glow-magenta",
    magnet: "text-glow-yellow",
    x2: "text-glow-yellow",
  };

  return (
    <main className="scanlines relative h-screen w-screen overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="scanlines-overlay" />

      {/* HUD */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-4 sm:p-6">
        <div className="panel-neon pointer-events-auto rounded-xl px-4 py-3">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Score</div>
          <div className="font-display text-3xl font-black text-glow-cyan tabular-nums">{score}</div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Meilleur : <span className="text-glow-yellow">{best}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            onClick={() => setMuted((m) => !m)}
            className="panel-neon pointer-events-auto rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-widest text-glow-cyan transition hover:scale-105"
          >
            {muted ? "🔇 Muet" : "🔊 Son"}
          </button>
          {combo > 1 && running && (
            <div className="panel-neon rounded-xl px-4 py-2 animate-scale-in">
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Combo</div>
              <div className="font-display text-2xl font-black text-glow-magenta tabular-nums">×{combo}</div>
            </div>
          )}
        </div>
      </header>

      {/* Active powers */}
      {activePowers.length > 0 && running && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex justify-center gap-2 px-4">
          {activePowers.map((k) => (
            <div key={k} className="panel-neon float-y rounded-full px-4 py-2">
              <span className={`text-xs font-bold uppercase tracking-[0.2em] ${powerColor[k]}`}>
                {powerLabel[k]} · {Math.ceil(powers[k] / 1000)}s
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Menus */}
      {!running && (
        <div className="absolute inset-0 z-20 flex items-center justify-center p-6">
          <div className="panel-neon pulse-glow w-full max-w-md rounded-2xl p-8 text-center animate-fade-in">
            <div className="mb-2 text-xs uppercase tracking-[0.5em] text-muted-foreground">Arcade infini</div>
            <h1 className="font-display text-5xl font-black leading-none sm:text-6xl">
              <span className="text-glow-cyan">NEON</span>{" "}
              <span className="text-glow-magenta">RUSH</span>
            </h1>
            <p className="mx-auto mt-4 max-w-sm text-sm text-muted-foreground">
              Collecte les <span className="text-glow-cyan font-bold">orbes cyan</span>, évite les{" "}
              <span className="text-glow-magenta font-bold">pointes magenta</span> et enchaîne les combos
              pour faire exploser ton score.
            </p>

            {gameOver && (
              <div className="mt-6 rounded-xl border border-border/60 bg-black/30 p-4">
                <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">Score final</div>
                <div className="font-display text-4xl font-black text-glow-magenta tabular-nums">{score}</div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Record : <span className="text-glow-yellow">{best}</span>
                </div>
              </div>
            )}

            <button
              onClick={start}
              className="mt-8 w-full rounded-xl border border-[color:var(--neon-cyan)] bg-gradient-to-r from-[color:var(--neon-cyan)]/20 via-[color:var(--neon-magenta)]/20 to-[color:var(--neon-cyan)]/20 px-6 py-4 font-display text-lg font-black uppercase tracking-[0.3em] text-glow-cyan transition hover:scale-[1.02] hover:shadow-[0_0_40px_-5px_var(--neon-magenta)]"
            >
              {gameOver ? "Rejouer" : "Jouer"}
            </button>

            {gameOver && (
              <button
                onClick={share}
                className="mt-3 w-full rounded-xl border border-border/60 bg-black/20 px-6 py-3 font-display text-sm font-bold uppercase tracking-[0.3em] text-glow-yellow transition hover:scale-[1.02]"
              >
                Partager mon score
              </button>
            )}

            <div className="mt-6 grid grid-cols-2 gap-2 text-left text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              <div>🖱 Souris / doigt</div>
              <div>⌨ WASD ou flèches</div>
              <div className="text-glow-cyan">S · Bouclier</div>
              <div className="text-glow-magenta">T · Ralenti</div>
              <div className="text-glow-yellow">M · Aimant</div>
              <div className="text-glow-yellow">×2 · Double score</div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
