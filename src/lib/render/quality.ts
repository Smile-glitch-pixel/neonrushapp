/**
 * NEON RUSH — Paramètres de qualité adaptatifs
 * Détecte les capacités de l'appareil et ajuste le rendu en conséquence.
 */

export interface QualitySettings {
  // Rendu
  dpr: number;                    // Device Pixel Ratio (cappé)
  canvasWidth: number;
  canvasHeight: number;

  // Particules
  maxParticles: number;
  particleQuality: 'low' | 'medium' | 'high';

  // Post-process
  bloomEnabled: boolean;
  bloomIntensity: number;
  trailEnabled: boolean;
  trailQuality: 'low' | 'medium' | 'high';

  // Background
  backgroundLayers: number;
  backgroundQuality: 'low' | 'medium' | 'high';

  // Effets
  screenShakeEnabled: boolean;
  chromaticAberrationEnabled: boolean;
  scanlinesEnabled: boolean;

  // Performance
  targetFPS: number;
  fixedTimestep: number;
  maxSubSteps: number;

  // Skins
  skinDetailLevel: 'simple' | 'normal' | 'full';

  // Debug
  showFPS: boolean;
  showParticleCount: boolean;
  showDrawCalls: boolean;
}

/** Présets de qualité */
export const QualityPresets = {
  low: {
    dpr: 1,
    maxParticles: 50,
    particleQuality: 'low' as const,
    bloomEnabled: false,
    bloomIntensity: 0,
    trailEnabled: false,
    trailQuality: 'low' as const,
    backgroundLayers: 2,
    backgroundQuality: 'low' as const,
    screenShakeEnabled: false,
    chromaticAberrationEnabled: false,
    scanlinesEnabled: false,
    targetFPS: 30,
    fixedTimestep: 1/30,
    maxSubSteps: 3,
    skinDetailLevel: 'simple' as const,
    showFPS: false,
    showParticleCount: false,
    showDrawCalls: false,
  },

  medium: {
    dpr: 1.5,
    maxParticles: 150,
    particleQuality: 'medium' as const,
    bloomEnabled: true,
    bloomIntensity: 0.3,
    trailEnabled: true,
    trailQuality: 'medium' as const,
    backgroundLayers: 4,
    backgroundQuality: 'medium' as const,
    screenShakeEnabled: true,
    chromaticAberrationEnabled: false,
    scanlinesEnabled: false,
    targetFPS: 60,
    fixedTimestep: 1/60,
    maxSubSteps: 5,
    skinDetailLevel: 'normal' as const,
    showFPS: false,
    showParticleCount: false,
    showDrawCalls: false,
  },

  high: {
    dpr: 2,
    maxParticles: 300,
    particleQuality: 'high' as const,
    bloomEnabled: true,
    bloomIntensity: 0.5,
    trailEnabled: true,
    trailQuality: 'high' as const,
    backgroundLayers: 5,
    backgroundQuality: 'high' as const,
    screenShakeEnabled: true,
    chromaticAberrationEnabled: true,
    scanlinesEnabled: true,
    targetFPS: 60,
    fixedTimestep: 1/60,
    maxSubSteps: 5,
    skinDetailLevel: 'full' as const,
    showFPS: true,
    showParticleCount: true,
    showDrawCalls: true,
  },

  ultra: {
    dpr: 2, // computed lazily in getQualitySettings
    maxParticles: 500,
    particleQuality: 'high' as const,
    bloomEnabled: true,
    bloomIntensity: 0.6,
    trailEnabled: true,
    trailQuality: 'high' as const,
    backgroundLayers: 5,
    backgroundQuality: 'high' as const,
    screenShakeEnabled: true,
    chromaticAberrationEnabled: true,
    scanlinesEnabled: true,
    targetFPS: 120,
    fixedTimestep: 1/120,
    maxSubSteps: 3,
    skinDetailLevel: 'full' as const,
    showFPS: true,
    showParticleCount: true,
    showDrawCalls: true,
  },
} as const;

/** Détecte le preset recommandé basé sur le hardware */
export function detectQualityPreset(): keyof typeof QualityPresets {
  // Vérifie les capacités GPU/CPU
  const canvas = document.createElement('canvas');
  const gl = (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) as WebGLRenderingContext | null;

  let score = 0;

  // Device pixel ratio
  const dpr = window.devicePixelRatio || 1;
  if (dpr <= 1) score += 2;
  else if (dpr <= 1.5) score += 1;

  // GPU info
  if (gl) {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (debugInfo) {
      const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
      const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
      // console.log('GPU:', renderer, vendor);

      // Détection grossière mobile vs desktop
      const isMobile = /mobile|android|iphone|ipad/i.test(navigator.userAgent);
      const isIntegrated = /intel|iris|uhd|hd graphics|adreno|mali|powervr|videocore/i.test(renderer + vendor);

      if (isMobile) score -= 2;
      if (isIntegrated) score -= 1;
      else score += 2;
    }
  }

  // Hardware concurrency (CPU cores)
  const cores = navigator.hardwareConcurrency || 4;
  if (cores >= 8) score += 2;
  else if (cores >= 4) score += 1;
  else score -= 1;

  // Memory (si dispo)
  const mem = (navigator as any).deviceMemory;
  if (mem) {
    if (mem >= 8) score += 1;
    else if (mem <= 2) score -= 1;
  }

  // Préférence utilisateur (reduced motion)
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) score -= 3;

  // Battery API (si dispo)
  // Note: pas fiable partout, on l'ignore pour l'instant

  // Map score to preset
  if (score <= 0) return 'low';
  if (score <= 2) return 'medium';
  if (score <= 5) return 'high';
  return 'ultra';
}

/** Crée les settings de qualité finaux */
export function getQualitySettings(
  canvasWidth: number,
  canvasHeight: number,
  overridePreset?: keyof typeof QualityPresets
): QualitySettings {
  const presetKey = overridePreset || detectQualityPreset();
  const preset = QualityPresets[presetKey];

  // Calcule DPR effectif (capé par la taille du canvas)
  // Pour 'ultra', utilise le devicePixelRatio réel si dispo
  const baseDPR = presetKey === 'ultra' && typeof window !== 'undefined'
    ? (window.devicePixelRatio || preset.dpr)
    : preset.dpr;

  const maxDPR = Math.min(baseDPR, 2048 / Math.max(canvasWidth, canvasHeight));
  const effectiveDPR = Math.max(1, Math.min(baseDPR, maxDPR));

  return {
    ...preset,
    dpr: effectiveDPR,
    canvasWidth,
    canvasHeight,
  };
}

/** Applique les settings au canvas */
export function applyQualityToCanvas(
  canvas: HTMLCanvasElement,
  settings: QualitySettings
): CanvasRenderingContext2D {
  const { dpr, canvasWidth, canvasHeight } = settings;

  // Taille logique vs taille physique
  canvas.width = canvasWidth * dpr;
  canvas.height = canvasHeight * dpr;
  canvas.style.width = `${canvasWidth}px`;
  canvas.style.height = `${canvasHeight}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // Optimisations contexte
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = settings.particleQuality === 'high' ? 'high' : 'low';

  return ctx;
}

/** Met à jour les settings dynamiquement (ex: baisse qualité si FPS bas) */
export function adaptQualitySettings(
  current: QualitySettings,
  avgFPS: number,
  frameTime: number
): QualitySettings {
  const targetFPS = current.targetFPS;
  const ratio = avgFPS / targetFPS;

  // Si performance trop basse, dégrade
  if (ratio < 0.85 && frameTime > 1000 / targetFPS * 1.2) {
    const nextLower = getLowerPreset(current);
    if (nextLower) {
      console.info('[Quality] Degrading quality due to low FPS', { avgFPS, targetFPS });
      return { ...current, ...nextLower };
    }
  }

  // Si marge confortable, pourrait upgrader (mais on évite le yo-yo)
  // if (ratio > 1.1 && frameTime < 1000 / targetFPS * 0.8) { ... }

  return current;
}

function getLowerPreset(current: QualitySettings): Partial<QualitySettings> | null {
  // Ordre de dégradation progressive
  if (current.chromaticAberrationEnabled) {
    return { chromaticAberrationEnabled: false };
  }
  if (current.bloomEnabled) {
    return { bloomEnabled: false, bloomIntensity: 0 };
  }
  if (current.trailEnabled) {
    return { trailEnabled: false };
  }
  if (current.backgroundLayers > 2) {
    return { backgroundLayers: current.backgroundLayers - 1 };
  }
  if (current.maxParticles > 50) {
    return { maxParticles: Math.max(50, current.maxParticles - 50) };
  }
  if (current.skinDetailLevel === 'full') {
    return { skinDetailLevel: 'normal' };
  }
  if (current.skinDetailLevel === 'normal') {
    return { skinDetailLevel: 'simple' };
  }
  if (current.dpr > 1) {
    return { dpr: Math.max(1, current.dpr - 0.5) };
  }
  return null;
}

/** Sauvegarde la préférence utilisateur */
export function saveQualityPreference(preset: keyof typeof QualityPresets): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem('neonrush_quality_preset', preset);
  } catch {}
}

/** Charge la préférence utilisateur */
export function loadQualityPreference(): keyof typeof QualityPresets | null {
  if (typeof window === 'undefined') return null;
  try {
    const saved = localStorage.getItem('neonrush_quality_preset');
    if (saved && saved in QualityPresets) {
      return saved as keyof typeof QualityPresets;
    }
  } catch {}
  return null;
}

/** Écouteur pour prefers-reduced-motion */
export function setupReducedMotionListener(onChange: (reduced: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const handler = (e: MediaQueryListEvent) => onChange(e.matches);
  mediaQuery.addEventListener('change', handler);
  return () => mediaQuery.removeEventListener('change', handler);
}