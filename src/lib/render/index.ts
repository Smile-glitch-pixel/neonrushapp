/**
 * NEON RUSH — Pipeline de rendu principal
 * Compose tous les modules de rendu en un seul point d'entrée.
 * Remplace le gros render loop dans NeonRush.tsx
 */

import {
  particlePool,
  updateParticles,
  drawParticles,
  spawnParticles,
  ParticlePresets,
  clearParticles,
  getParticleCount,
  type DetailedParticle,
  type ParticleConfig
} from './particles';

import {
  createBackground,
  drawBackground,
  type BGLayer
} from './background';

import {
  renderSkin,
  getSkinRenderer,
  parseSkinColors,
  type SkinColors,
  type SkinRenderContext,
  type SkinRenderer
} from './skins';

import {
  screenEffects,
  updateScreenEffects,
  applyScreenEffects,
  addScreenShake,
  addFlash,
  addVignette,
  addChromaticAberration,
  addSlowMotion,
  addFreezeFrame,
  clearScreenEffects,
  initBloomCanvases,
  applyBloom,
  setBloomEnabled,
  setBloomIntensity,
  initTrailCanvas,
  updateTrail as updateTrailEffect,
  setTrailEnabled,
  setTrailDecay,
  triggerHitPause,
  updateHitPause,
  addComboPopup,
  updateAndDrawComboPopups,
  clearComboPopups,
  type ScreenEffect,
  type ComboPopup
} from './effects';

import {
  drawEntity,
  drawPlayer,
  drawGhost,
  drawOrb,
  drawHazard,
  drawVault,
  drawPowerup,
  type RenderEntity
} from './entities';

import {
  addTrailPoint,
  updateTrail,
  drawTrail,
  drawRibbonTrail,
  clearTrail,
  getTrailPoints,
  setMaxTrailPoints,
  type TrailPoint
} from './trails';

import {
  getQualitySettings,
  applyQualityToCanvas,
  adaptQualitySettings,
  saveQualityPreference,
  loadQualityPreference,
  setupReducedMotionListener,
  type QualitySettings,
  QualityPresets
} from './quality';

// ============================================================
// TYPES DU GAME STATE (à adapter selon ton NeonRush.tsx)
// ============================================================

export interface GameEntity {
  x: number;
  y: number;
  r: number;
  type: 'orb' | 'hazard' | 'vault' | 'powerup' | 'ghost' | 'player';
  color?: string;
  color2?: string;
  color3?: string;
  skinColors?: [string, string, string];
  skinId?: string;
  rotation?: number;
  pulse?: number;
  variant?: string;
  progress?: number;
  isGhost?: boolean;
  isDown?: boolean;
  name?: string;
  combo?: number;
  velocity?: { x: number; y: number };
}

export interface PlayerState {
  x: number;
  y: number;
  r: number;
  skinColors: [string, string, string];
  skinId: string;
  isDown: boolean;
  combo: number;
  velocity: { x: number; y: number };
}

export interface GhostState {
  x: number;
  y: number;
  visible: boolean;
  hidden: boolean;
  down: boolean;
  name: string;
  colors: [string, string, string];
}

export interface GameState {
  player: PlayerState;
  ghost?: GhostState;
  entities: GameEntity[];
  particles: DetailedParticle[]; // deprecated, utilise particlePool
  time: number;
  screenShake: number;
  flash: number;
  vignette: number;
  combo: number;
  score: number;
}

// ============================================================
// PIPELINE PRINCIPAL
// ============================================================

export interface RenderPipeline {
  // Core
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  settings: QualitySettings;
  background: BGLayer[];

  // State
  lastTime: number;
  frameCount: number;
  fps: number;
  avgFrameTime: number;

  // Methods
  render: (state: GameState, dt: number) => void;
  resize: (width: number, height: number) => void;
  setQuality: (preset: keyof typeof QualityPresets) => void;
  getStats: () => RenderStats;
}

export interface RenderStats {
  fps: number;
  frameTime: number;
  particleCount: number;
  trailPoints: number;
  backgroundLayers: number;
  bloomEnabled: boolean;
  qualityPreset: string;
}

let animationFrameId: number | null = null;
let pipelineInstance: RenderPipeline | null = null;

/** Crée le pipeline de rendu complet */
export function createRenderPipeline(
  canvas: HTMLCanvasElement,
  initialWidth: number,
  initialHeight: number,
  qualityOverride?: keyof typeof QualityPresets
): RenderPipeline {
  // Settings de qualité
  const savedPreset = loadQualityPreference();
  const settings = getQualitySettings(initialWidth, initialHeight, qualityOverride || savedPreset || undefined);

  // Applique au canvas
  const ctx = applyQualityToCanvas(canvas, settings);

  // Background layers
  const background = createBackground(settings.backgroundLayers);

  // Init post-process canvases
  initBloomCanvases(canvas.width, canvas.height);
  initTrailCanvas(canvas.width, canvas.height);

  // Écoute reduced motion
  const cleanupReducedMotion = setupReducedMotionListener((reduced) => {
    if (reduced) {
      settings.screenShakeEnabled = false;
      settings.chromaticAberrationEnabled = false;
      settings.bloomEnabled = false;
      settings.trailEnabled = false;
      settings.particleQuality = 'low';
      settings.maxParticles = 30;
    }
  });

  let lastTime = performance.now();
  let frameCount = 0;
  let fps = 60;
  let avgFrameTime = 16.67;
  const frameTimes: number[] = [];

  const pipeline: RenderPipeline = {
    canvas,
    ctx,
    settings,
    background,
    lastTime,
    frameCount,
    fps,
    avgFrameTime,

    render(state, dt) {
      const { ctx, settings, background } = pipeline;
      const w = settings.canvasWidth;
      const h = settings.canvasHeight;
      const now = performance.now();

      // --- 1. CLEAR ---
      ctx.clearRect(0, 0, w, h);

      // --- 2. BACKGROUND ---
      drawBackground(ctx, background, state.time, w, h, state.player.x, state.player.y);

      // --- 3. ENTITIES (z-ordered) ---
      // Trie par type pour z-order: vaults -> orbs -> hazards -> powerups -> ghost -> player
      const zOrder = ['vault', 'orb', 'hazard', 'powerup', 'ghost', 'player'];
      const sortedEntities = [...state.entities].sort((a, b) =>
        zOrder.indexOf(a.type) - zOrder.indexOf(b.type)
      );

      for (const entity of sortedEntities) {
        drawEntity(ctx, entity, state.time);
      }

      // Joueur principal (dessiné par-dessus tout)
      drawPlayer(ctx, {
        x: state.player.x,
        y: state.player.y,
        r: state.player.r,
        skinColors: state.player.skinColors,
        skinId: state.player.skinId,
        isDown: state.player.isDown,
        combo: state.player.combo,
        velocity: state.player.velocity,
      }, state.time);

      // Ghost partenaire
      if (state.ghost?.visible && !state.ghost.hidden) {
        drawGhost(ctx, {
          x: state.ghost.x,
          y: state.ghost.y,
          r: state.player.r, // même taille
          skinColors: state.ghost.colors,
          skinId: 'rare', // ou déduit du partenaire
          isDown: state.ghost.down,
          name: state.ghost.name,
        }, state.time);
      }

      // --- 4. TRAIL JOUEUR ---
      if (settings.trailEnabled) {
        addTrailPoint(state.player.x, state.player.y, state.player.skinColors[0], state.player.r * 0.5);
        updateTrail(dt);
        drawRibbonTrail(ctx, state.player.skinColors[0], state.player.r * 1.5);
      }

      // --- 5. PARTICLES ---
      updateParticles(dt);
      drawParticles(ctx);

      // --- 6. COMBO POPUPS ---
      updateAndDrawComboPopups(ctx, dt);

      // --- 7. SCREEN EFFECTS (shake, flash, vignette, etc.) ---
      const timeScale = updateScreenEffects(dt);
      const { shakeX, shakeY } = applyScreenEffects(ctx, w, h, canvas);

      // --- 8. BLOOM (post-process) ---
      if (settings.bloomEnabled) {
        applyBloom(ctx, canvas);
      }

      // --- 9. HIT PAUSE ---
      updateHitPause(dt);

      // --- 10. DEBUG OVERLAY ---
      if (settings.showFPS || settings.showParticleCount || settings.showDrawCalls) {
        drawDebugOverlay(ctx, w, h);
      }

      // Met à jour stats
      pipeline.frameCount++;
      const frameTime = now - pipeline.lastTime;
      frameTimes.push(frameTime);
      if (frameTimes.length > 60) frameTimes.shift();

      if (frameTimes.length >= 10) {
        pipeline.avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        pipeline.fps = 1000 / pipeline.avgFrameTime;
      }
      pipeline.lastTime = now;

      // Adaptive quality (tous les 2 secondes)
      if (pipeline.frameCount % 120 === 0) {
        const adapted = adaptQualitySettings(settings, pipeline.fps, pipeline.avgFrameTime);
        if (adapted !== settings) {
          Object.assign(settings, adapted);
        }
      }
    },

    resize(width, height) {
      settings.canvasWidth = width;
      settings.canvasHeight = height;
      applyQualityToCanvas(canvas, settings);
      initBloomCanvases(canvas.width, canvas.height);
      initTrailCanvas(canvas.width, canvas.height);

      // Recreate background with new dimensions
      pipeline.background = createBackground(settings.backgroundLayers);
    },

    setQuality(preset) {
      const newSettings = getQualitySettings(settings.canvasWidth, settings.canvasHeight, preset);
      Object.assign(settings, newSettings);
      saveQualityPreference(preset);
      applyQualityToCanvas(canvas, settings);
      initBloomCanvases(canvas.width, canvas.height);
      initTrailCanvas(canvas.width, canvas.height);
      pipeline.background = createBackground(settings.backgroundLayers);
    },

    getStats() {
      return {
        fps: Math.round(pipeline.fps),
        frameTime: Math.round(pipeline.avgFrameTime * 100) / 100,
        particleCount: getParticleCount(),
        trailPoints: getTrailPoints().length,
        backgroundLayers: background.length,
        bloomEnabled: settings.bloomEnabled,
        qualityPreset: Object.keys(QualityPresets).find(k => QualityPresets[k] === settings) || 'custom',
      };
    },
  };

  pipelineInstance = pipeline;
  return pipeline;
}

/** Démarre la boucle de rendu */
export function startRenderLoop(
  pipeline: RenderPipeline,
  getState: () => GameState,
  onFrame?: (dt: number) => void
): () => void {
  function frame(now: number) {
    const dt = Math.min((now - pipeline.lastTime) / 1000, 1 / 30); // Cap à 30 FPS min

    // Simulation callback (physics, input, etc.)
    if (onFrame) onFrame(dt);

    // Render
    const state = getState();
    state.time = now;
    pipeline.render(state, dt);

    animationFrameId = requestAnimationFrame(frame);
  }

  animationFrameId = requestAnimationFrame(frame);

  // Retourne fonction d'arrêt
  return () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
  };
}

/** Arrête la boucle de rendu */
export function stopRenderLoop(): void {
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

/** Overlay debug */
function drawDebugOverlay(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const stats = pipelineInstance?.getStats();
  if (!stats) return;

  ctx.save();
  ctx.globalAlpha = 0.8;
  ctx.fillStyle = '#000';
  ctx.fillRect(5, 5, 200, 120);
  ctx.fillStyle = '#0f0';
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  let y = 10;
  const line = (text: string) => { ctx.fillText(text, 10, y); y += 16; };

  line(`FPS: ${stats.fps} (${stats.frameTime}ms)`);
  line(`Particles: ${stats.particleCount}`);
  line(`Trail points: ${stats.trailPoints}`);
  line(`BG layers: ${stats.backgroundLayers}`);
  line(`Bloom: ${stats.bloomEnabled ? 'ON' : 'OFF'}`);
  line(`Quality: ${stats.qualityPreset}`);

  ctx.restore();
}

/** Nettoie toutes les ressources */
export function destroyRenderPipeline(): void {
  stopRenderLoop();
  clearParticles();
  clearTrail();
  clearScreenEffects();
  clearComboPopups();
  pipelineInstance = null;
}

// ============================================================
// RE-EXPORTS COMMODES (pour migration progressive)
// ============================================================

// Particules
export {
  particlePool,
  updateParticles,
  drawParticles,
  spawnParticles,
  ParticlePresets,
  clearParticles,
  getParticleCount,
  type DetailedParticle,
  type ParticleConfig
} from './particles';

// Background
export {
  createBackground,
  drawBackground,
  type BGLayer,
  type BGElement
} from './background';

// Skins
export {
  renderSkin,
  getSkinRenderer,
  parseSkinColors,
  type SkinColors,
  type SkinRenderContext,
  type SkinRenderer
} from './skins';

// Effects
export {
  screenEffects,
  updateScreenEffects,
  applyScreenEffects,
  addScreenShake,
  addFlash,
  addVignette,
  addChromaticAberration,
  addSlowMotion,
  addFreezeFrame,
  clearScreenEffects,
  initBloomCanvases,
  applyBloom,
  setBloomEnabled,
  setBloomIntensity,
  initTrailCanvas,
  updateTrail as updateTrailEffect,
  setTrailEnabled,
  setTrailDecay,
  triggerHitPause,
  updateHitPause,
  addComboPopup,
  updateAndDrawComboPopups,
  clearComboPopups,
  type ScreenEffect,
  type ComboPopup
} from './effects';

// Entities
export {
  drawEntity,
  drawPlayer,
  drawGhost,
  drawOrb,
  drawHazard,
  drawVault,
  drawPowerup,
  type RenderEntity
} from './entities';

// Trails
export {
  addTrailPoint,
  updateTrail,
  drawTrail,
  drawRibbonTrail,
  clearTrail,
  getTrailPoints,
  setMaxTrailPoints,
  type TrailPoint
} from './trails';

// Quality
export {
  getQualitySettings,
  applyQualityToCanvas,
  adaptQualitySettings,
  saveQualityPreference,
  loadQualityPreference,
  setupReducedMotionListener,
  type QualitySettings,
  QualityPresets
} from './quality';