/**
 * NEON RUSH — Effets d'écran et post-process
 * Screen shake, flash, vignette, bloom, chromatic aberration, etc.
 */

export type ScreenEffectType = 'shake' | 'flash' | 'vignette' | 'chromatic' | 'slowmo' | 'freeze';

export interface ScreenEffect {
  type: ScreenEffectType;
  intensity: number;      // 0-1 (ou plus pour shake)
  duration: number;       // secondes
  timer: number;          // temps restant
  data?: Record<string, unknown>; // données spécifiques (ex: couleur flash)
}

export const screenEffects: ScreenEffect[] = [];

/** Clamp utility (hoisted) */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Ajoute un screen shake */
export function addScreenShake(intensity: number = 1, duration: number = 0.3): void {
  screenEffects.push({ type: 'shake', intensity: clamp(intensity, 0, 3), duration, timer: duration });
}

/** Ajoute un flash d'écran */
export function addFlash(intensity: number = 1, duration: number = 0.15, color: string = '#ffffff'): void {
  screenEffects.push({ type: 'flash', intensity: clamp(intensity, 0, 1), duration, timer: duration, data: { color } });
}

/** Ajoute une vignette */
export function addVignette(intensity: number = 1, duration: number = 1): void {
  screenEffects.push({ type: 'vignette', intensity: clamp(intensity, 0, 1), duration, timer: duration });
}

/** Ajoute aberration chromatique */
export function addChromaticAberration(intensity: number = 1, duration: number = 0.2): void {
  screenEffects.push({ type: 'chromatic', intensity: clamp(intensity, 0, 2), duration, timer: duration });
}

/** Slow motion temporaire */
export function addSlowMotion(intensity: number = 0.5, duration: number = 0.5): void {
  screenEffects.push({ type: 'slowmo', intensity: clamp(intensity, 0, 1), duration, timer: duration });
}

/** Freeze frame (hit pause) */
export function addFreezeFrame(duration: number = 0.05): void {
  screenEffects.push({ type: 'freeze', intensity: 1, duration, timer: duration });
}

/** Met à jour tous les effets (appelé chaque frame) */
export function updateScreenEffects(dt: number): number {
  // Retourne le multiplicateur de temps global (pour slowmo/freeze)
  let timeScale = 1;

  for (let i = screenEffects.length - 1; i >= 0; i--) {
    const fx = screenEffects[i];
    fx.timer -= dt;
    if (fx.timer <= 0) {
      screenEffects.splice(i, 1);
      continue;
    }

    if (fx.type === 'slowmo') {
      timeScale = Math.min(timeScale, 1 - fx.intensity * 0.8);
    }
    if (fx.type === 'freeze') {
      timeScale = 0;
    }
  }

  return timeScale;
}

/** Applique les effets visuels au contexte de rendu */
export function applyScreenEffects(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  gameCanvas?: HTMLCanvasElement // pour chromatic aberration
): { shakeX: number; shakeY: number } {
  let shakeX = 0;
  let shakeY = 0;

  for (const fx of screenEffects) {
    const t = 1 - fx.timer / fx.duration;
    const ease = 1 - Math.pow(1 - t, 3); // easeOutCubic

    switch (fx.type) {
      case 'shake': {
        const magnitude = fx.intensity * 15 * ease;
        shakeX += (Math.random() - 0.5) * magnitude * 2;
        shakeY += (Math.random() - 0.5) * magnitude * 2;
        // On applique la translation directement
        ctx.translate(shakeX, shakeY);
        break;
      }

      case 'flash': {
        const color = (fx.data?.color as string) || '#ffffff';
        ctx.globalAlpha = fx.intensity * 0.6 * ease;
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 1;
        break;
      }

      case 'vignette': {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
        g.addColorStop(0, 'rgba(0,0,0,0)');
        g.addColorStop(0.6, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(0,0,0,${fx.intensity * 0.7 * ease})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        break;
      }

      case 'chromatic': {
        if (gameCanvas && fx.intensity > 0.1) {
          // Simule l'aberration chromatique en redessinant le canvas décalé
          // Note: coûteux, à utiliser avec parcimonie
          const offset = fx.intensity * 3 * ease;

          // Canal R (décalé à droite)
          ctx.globalCompositeOperation = 'lighter';
          ctx.save();
          ctx.filter = 'sepia(1) hue-rotate(-90deg) saturate(5)';
          ctx.globalAlpha = 0.12 * fx.intensity * ease;
          ctx.drawImage(gameCanvas, offset, 0);
          ctx.restore();

          // Canal B (décalé à gauche)
          ctx.save();
          ctx.filter = 'sepia(1) hue-rotate(90deg) saturate(5)';
          ctx.globalAlpha = 0.12 * fx.intensity * ease;
          ctx.drawImage(gameCanvas, -offset, 0);
          ctx.restore();

          ctx.globalCompositeOperation = 'source-over';
          ctx.filter = 'none';
        }
        break;
      }
    }
  }

  return { shakeX, shakeY };
}

/** Vide tous les effets */
export function clearScreenEffects(): void {
  screenEffects.length = 0;
}

/** Retourne la liste des effets actifs (pour debug) */
export function getActiveScreenEffects(): ScreenEffect[] {
  return [...screenEffects];
}

/** ============================================================
 *  BLOOM / GLOW POST-PROCESS
 *  ============================================================ */

let bloomCanvas: HTMLCanvasElement | null = null;
let bloomBlurCanvas: HTMLCanvasElement | null = null;
let bloomEnabled = true;
let bloomIntensity = 0.4;
let bloomThreshold = 0.7; // Seuil de luminance pour extraire les zones brillantes

/** Initialise les canvases de bloom (appelé au resize) */
export function initBloomCanvases(width: number, height: number): void {
  if (!bloomCanvas) {
    bloomCanvas = document.createElement('canvas');
    bloomBlurCanvas = document.createElement('canvas');
  }
  if (!bloomCanvas || !bloomBlurCanvas) return;
  bloomCanvas.width = width;
  bloomCanvas.height = height;
  bloomBlurCanvas.width = width;
  bloomBlurCanvas.height = height;
}

/** Active/désactive le bloom */
export function setBloomEnabled(enabled: boolean): void {
  bloomEnabled = enabled;
}

/** Définit l'intensité du bloom */
export function setBloomIntensity(intensity: number): void {
  bloomIntensity = clamp(intensity, 0, 2);
}

/** Applique l'effet de bloom (additif) */
export function applyBloom(ctx: CanvasRenderingContext2D, sourceCanvas: HTMLCanvasElement): void {
  if (!bloomEnabled || !bloomCanvas || !bloomBlurCanvas) return;

  const bctx = bloomCanvas.getContext('2d')!;
  const blurCtx = bloomBlurCanvas.getContext('2d')!;
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  // 1. Extraire les pixels brillants (brightness + contrast)
  bctx.filter = `brightness(2.5) contrast(2) saturate(1.5)`;
  bctx.drawImage(sourceCanvas, 0, 0);

  // 2. Blur en deux passes (box blur approximation via drawImage scaling)
  // Pass 1: horizontal
  blurCtx.filter = 'blur(4px)';
  blurCtx.drawImage(bloomCanvas, 0, 0);

  // Pass 2: vertical
  bctx.filter = 'blur(4px)';
  bctx.drawImage(bloomBlurCanvas, 0, 0);

  // 3. Blend additif sur le canvas principal
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = bloomIntensity;
  ctx.drawImage(bloomCanvas, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
}

/** ============================================================
 *  TRAILS / MOTION BLUR
 *  ============================================================ */

let trailCanvas: HTMLCanvasElement | null = null;
let trailEnabled = true;
let trailDecay = 0.92; // 0-1, plus bas = plus court

/** Initialise le canvas de trail */
export function initTrailCanvas(width: number, height: number): void {
  if (!trailCanvas) {
    trailCanvas = document.createElement('canvas');
  }
  trailCanvas.width = width;
  trailCanvas.height = height;
  // Clear au reset
  const tctx = trailCanvas.getContext('2d')!;
  tctx.clearRect(0, 0, width, height);
}

/** Active/désactive les trails */
export function setTrailEnabled(enabled: boolean): void {
  trailEnabled = enabled;
}

/** Définit le decay du trail */
export function setTrailDecay(decay: number): void {
  trailDecay = clamp(decay, 0.5, 0.99);
}

/** Met à jour et dessine le trail (motion blur) */
export function updateTrail(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  currentFrameCtx: CanvasRenderingContext2D
): void {
  if (!trailEnabled || !trailCanvas) return;

  const tctx = trailCanvas.getContext('2d')!;
  const w = sourceCanvas.width;
  const h = sourceCanvas.height;

  // Fade le trail précédent
  tctx.globalCompositeOperation = 'source-over';
  tctx.globalAlpha = trailDecay;
  tctx.drawImage(trailCanvas, 0, 0);

  // Ajoute la frame courante (seulement les entités en mouvement, pas l'UI)
  // On utilise un masque pour ne garder que les zones qui ont bougé
  tctx.globalCompositeOperation = 'lighter';
  tctx.globalAlpha = 0.3;
  tctx.drawImage(sourceCanvas, 0, 0);

  // Dessine le trail accumulé derrière la frame courante
  currentFrameCtx.globalCompositeOperation = 'source-over';
  currentFrameCtx.drawImage(trailCanvas, 0, 0);
}

/** Vide le trail */
export function clearTrail(): void {
  if (trailCanvas) {
    const tctx = trailCanvas.getContext('2d')!;
    tctx.clearRect(0, 0, trailCanvas.width, trailCanvas.height);
  }
}

/** ============================================================
 *  HIT PAUSE / FRAME FREEZE
 *  ============================================================ */

let hitPauseTimer = 0;
let hitPauseDuration = 0;

/** Déclenche un hit pause (freeze frame court) */
export function triggerHitPause(duration: number = 0.04): void {
  hitPauseDuration = duration;
  hitPauseTimer = duration;
  addFreezeFrame(duration);
}

/** Met à jour le hit pause, retourne true si en pause */
export function updateHitPause(dt: number): boolean {
  if (hitPauseTimer > 0) {
    hitPauseTimer -= dt;
    return true;
  }
  return false;
}

/** ============================================================
 *  COMBO / SCORE POPUPS
 *  ============================================================ */

export interface ComboPopup {
  x: number;
  y: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  vy: number;
}

const comboPopups: ComboPopup[] = [];

/** Ajoute un popup de combo/score */
export function addComboPopup(
  x: number,
  y: number,
  text: string,
  color: string = '#ffff00',
  size: number = 18
): void {
  comboPopups.push({
    x, y,
    text,
    color,
    size,
    life: 1.2,
    maxLife: 1.2,
    vy: -50,
  });
}

/** Met à jour et dessine les popups */
export function updateAndDrawComboPopups(ctx: CanvasRenderingContext2D, dt: number): void {
  for (let i = comboPopups.length - 1; i >= 0; i--) {
    const p = comboPopups[i];
    p.life -= dt;
    if (p.life <= 0) {
      comboPopups.splice(i, 1);
      continue;
    }

    const t = 1 - p.life / p.maxLife;
    const ease = 1 - Math.pow(1 - t, 3);

    p.y += p.vy * dt;
    p.vy *= 0.95;

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.globalAlpha = 1 - ease;
    ctx.fillStyle = p.color;
    ctx.font = `bold ${p.size * (1 + ease * 0.5)}px "Orbitron", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Outline
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 3;
    ctx.strokeText(p.text, 0, 0);
    ctx.fillText(p.text, 0, 0);
    ctx.restore();
  }
}

/** Vide les popups */
export function clearComboPopups(): void {
  comboPopups.length = 0;
}