/**
 * NEON RUSH — Renderers de skins par rareté
 * Remplace le gros switch-case de NeonRush.tsx par des renderers modulaires et extensibles.
 */

import type { CanvasRenderingContext2D } from 'react';

export interface SkinColors {
  primary: string;
  secondary: string;
  accent: string;
  glow: string;
}

export interface SkinRenderContext {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  size: number;
  time: number;
  colors: SkinColors;
  isGhost?: boolean;
  isDown?: boolean;
  combo?: number;
  velocity?: { x: number; y: number };
}

export type SkinRenderer = (context: SkinRenderContext) => void;

/** Utilitaires communs */
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

function drawGlowRing(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, intensity: number = 1) {
  const g = ctx.createRadialGradient(x, y, radius * 0.3, x, y, radius * 2);
  g.addColorStop(0, color.replace(')', `, ${0.4 * intensity})`).replace('rgb', 'rgba').replace('hsl', 'hsla'));
  g.addColorStop(1, color.replace(')', ', 0)').replace('rgb', 'rgba').replace('hsl', 'hsla'));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawPulseCore(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, time: number, speed: number = 1) {
  const pulse = 1 + Math.sin(time * 0.005 * speed) * 0.15;
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius * pulse);
  g.addColorStop(0, color);
  g.addColorStop(0.5, color);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius * pulse, 0, Math.PI * 2);
  ctx.fill();
}

/** ============================================================
 *  RENDERERS PAR RARETÉ
 *  ============================================================ */

// --- COMMON (Gris/Blanc simple) ---
export const commonRenderer: SkinRenderer = ({ ctx, x, y, size, time, colors, isGhost, isDown }) => {
  const alpha = isGhost ? 0.4 : (isDown ? 0.5 : 1);
  ctx.globalAlpha = alpha;

  // Corps principal
  const g = ctx.createRadialGradient(x, y, 0, x, y, size);
  g.addColorStop(0, colors.primary);
  g.addColorStop(0.7, colors.secondary);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();

  // Core
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.arc(x, y, size * 0.35, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 1;
};

// --- RARE (Bleu/Cyan avec anneau) ---
export const rareRenderer: SkinRenderer = ({ ctx, x, y, size, time, colors, isGhost, isDown }) => {
  const alpha = isGhost ? 0.4 : (isDown ? 0.5 : 1);
  ctx.globalAlpha = alpha;

  // Aura externe
  drawGlowRing(ctx, x, y, size, colors.glow, 0.6);

  // Anneau rotatif
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 0.001);
  ctx.strokeStyle = colors.secondary;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, size * 1.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Corps
  const g = ctx.createRadialGradient(x, y, 0, x, y, size);
  g.addColorStop(0, colors.primary);
  g.addColorStop(0.6, colors.secondary);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();

  // Core brillant
  drawPulseCore(ctx, x, y, size * 0.4, colors.accent, time);

  ctx.globalAlpha = 1;
};

// --- EPIC (Violet/Magenta avec géométrie) ---
export const epicRenderer: SkinRenderer = ({ ctx, x, y, size, time, colors, isGhost, isDown }) => {
  const alpha = isGhost ? 0.4 : (isDown ? 0.5 : 1);
  ctx.globalAlpha = alpha;

  // Aura double
  drawGlowRing(ctx, x, y, size * 1.3, colors.glow, 0.8);
  drawGlowRing(ctx, x, y, size * 0.8, colors.primary, 0.4);

  // Géométrie rotative (3 losanges)
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 0.0008);
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.rotate(i * Math.PI * 2 / 3);
    const grad = ctx.createLinearGradient(-size * 1.5, 0, size * 1.5, 0);
    grad.addColorStop(0, colors.primary);
    grad.addColorStop(0.5, colors.secondary);
    grad.addColorStop(1, colors.accent);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(-size * 1.5, 0);
    ctx.lineTo(0, -size * 0.7);
    ctx.lineTo(size * 1.5, 0);
    ctx.lineTo(0, size * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // Corps principal
  const g = ctx.createRadialGradient(x, y, 0, x, y, size);
  g.addColorStop(0, colors.primary);
  g.addColorStop(0.5, colors.secondary);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();

  // Core pulsant
  drawPulseCore(ctx, x, y, size * 0.45, colors.accent, time, 1.5);

  ctx.globalAlpha = 1;
};

// --- LEGENDARY (Or/Orange avec shards) ---
export const legendaryRenderer: SkinRenderer = ({ ctx, x, y, size, time, colors, isGhost, isDown }) => {
  const alpha = isGhost ? 0.5 : (isDown ? 0.6 : 1);
  ctx.globalAlpha = alpha;

  // Aura intense
  drawGlowRing(ctx, x, y, size * 1.8, colors.glow, 1);
  drawGlowRing(ctx, x, y, size, colors.secondary, 0.5);

  // Shards rotatifs (6 pointes)
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 0.0012);
  for (let i = 0; i < 6; i++) {
    ctx.save();
    ctx.rotate(i * Math.PI / 3 + Math.sin(time * 0.003 + i) * 0.1);
    const grad = ctx.createLinearGradient(0, 0, size * 2, 0);
    grad.addColorStop(0, colors.primary);
    grad.addColorStop(1, colors.accent);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(size * 2, -size * 0.4);
    ctx.lineTo(size * 2.5, 0);
    ctx.lineTo(size * 2, size * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();

  // Anneaux concentriques animés
  ctx.save();
  ctx.translate(x, y);
  for (let r = 0; r < 3; r++) {
    const ringPhase = (time * 0.002 + r * 2) % (Math.PI * 2);
    const ringRadius = size * (1 + r * 0.4) * (1 + Math.sin(ringPhase) * 0.1);
    ctx.strokeStyle = colors.glow;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.4 * (1 - r * 0.2);
    ctx.beginPath();
    ctx.arc(0, 0, ringRadius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // Corps
  const g = ctx.createRadialGradient(x, y, 0, x, y, size);
  g.addColorStop(0, colors.primary);
  g.addColorStop(0.4, colors.secondary);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();

  // Core très brillant
  drawPulseCore(ctx, x, y, size * 0.5, colors.accent, time, 2);

  ctx.globalAlpha = 1;
};

// --- MYTHIC (Arc-en-ciel/Prismatique - le plus complexe) ---
export const mythicRenderer: SkinRenderer = ({ ctx, x, y, size, time, colors, isGhost, isDown }) => {
  const alpha = isGhost ? 0.5 : (isDown ? 0.6 : 1);
  ctx.globalAlpha = alpha;

  // Multi-aura prismatique
  for (let i = 0; i < 4; i++) {
    const hue = (parseInt(colors.glow.match(/\d+/) || ['300'])[0] + i * 60 + time * 0.05) % 360;
    const glowColor = `hsl(${hue}, 80%, 60%)`;
    drawGlowRing(ctx, x, y, size * (1.5 + i * 0.5), glowColor, 0.8 - i * 0.15);
  }

  // Géométrie sacrée rotative (fleur de vie simplifiée)
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 0.0006);
  for (let ring = 0; ring < 2; ring++) {
    ctx.save();
    ctx.rotate(ring * Math.PI / 6 + time * 0.0003 * (ring === 0 ? 1 : -1));
    for (let i = 0; i < 6; i++) {
      ctx.save();
      ctx.rotate(i * Math.PI / 3);
      const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.8);
      grad.addColorStop(0, colors.primary);
      grad.addColorStop(0.5, colors.secondary);
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(size * 0.9, 0, size * 0.8, -Math.PI / 3, Math.PI / 3);
      ctx.lineTo(0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
  ctx.restore();

  // Particules orbitantes
  for (let i = 0; i < 8; i++) {
    const angle = time * 0.002 + i * Math.PI / 4;
    const orbitRadius = size * 1.6;
    const px = x + Math.cos(angle) * orbitRadius;
    const py = y + Math.sin(angle) * orbitRadius;
    const hue = (parseInt(colors.accent.match(/\d+/) || ['60'])[0] + i * 45 + time * 0.1) % 360;
    ctx.fillStyle = `hsl(${hue}, 100%, 70%)`;
    ctx.beginPath();
    ctx.arc(px, py, size * 0.15 * (1 + Math.sin(time * 0.01 + i) * 0.5), 0, Math.PI * 2);
    ctx.fill();
  }

  // Corps principal prismatique
  const g = ctx.createRadialGradient(x, y, 0, x, y, size);
  g.addColorStop(0, colors.primary);
  g.addColorStop(0.3, colors.secondary);
  g.addColorStop(0.7, colors.accent);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();

  // Core ultra-brillant avec effet "étoile"
  drawPulseCore(ctx, x, y, size * 0.55, colors.accent, time, 2.5);

  // Éclats core
  ctx.save();
  ctx.translate(x, y);
  for (let i = 0; i < 4; i++) {
    ctx.rotate(time * 0.003 + i * Math.PI / 2);
    ctx.fillStyle = colors.accent;
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.7);
    ctx.lineTo(-size * 0.15, -size * 0.3);
    ctx.lineTo(size * 0.15, -size * 0.3);
    ctx.fill();
  }
  ctx.restore();

  ctx.globalAlpha = 1;
};

/** ============================================================
 *  RENDERERS SPÉCIAUX (Event skins, etc.)
 *  ============================================================ */

// --- JACK O' LANTERN (Halloween) ---
export const jackolanternRenderer: SkinRenderer = ({ ctx, x, y, size, time, colors, isGhost, isDown }) => {
  const alpha = isGhost ? 0.4 : (isDown ? 0.5 : 1);
  ctx.globalAlpha = alpha;

  // Aura citrouille
  drawGlowRing(ctx, x, y, size * 1.3, '#ff6600', 0.8);

  // Corps citrouille (ovale légèrement aplati)
  const g = ctx.createRadialGradient(x, y, 0, x, y, size);
  g.addColorStop(0, '#ff8800');
  g.addColorStop(0.5, '#cc4400');
  g.addColorStop(1, '#882200');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(x, y, size, size * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Sillons de citrouille
  ctx.strokeStyle = '#aa3300';
  ctx.lineWidth = 1.5;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(x, y - size);
    ctx.quadraticCurveTo(x + i * size * 0.3, y, x, y + size);
    ctx.stroke();
  }

  // Visage animé
  const blink = Math.sin(time * 0.008) > 0.95;
  const mouthOpen = Math.sin(time * 0.003) > 0;

  // Yeux
  ctx.fillStyle = '#ffcc00';
  for (const eyeX of [x - size * 0.3, x + size * 0.3]) {
    ctx.beginPath();
    if (blink) {
      ctx.moveTo(eyeX - size * 0.15, y - size * 0.1);
      ctx.lineTo(eyeX + size * 0.15, y - size * 0.1);
      ctx.lineTo(eyeX + size * 0.1, y - size * 0.05);
      ctx.lineTo(eyeX - size * 0.1, y - size * 0.05);
    } else {
      ctx.moveTo(eyeX - size * 0.15, y - size * 0.15);
      ctx.lineTo(eyeX, y - size * 0.05);
      ctx.lineTo(eyeX + size * 0.15, y - size * 0.15);
      ctx.lineTo(eyeX, y - size * 0.25);
    }
    ctx.closePath();
    ctx.fill();
  }

  // Bouche
  ctx.fillStyle = '#ffcc00';
  ctx.beginPath();
  if (mouthOpen) {
    ctx.moveTo(x - size * 0.3, y + size * 0.2);
    ctx.lineTo(x, y + size * 0.45);
    ctx.lineTo(x + size * 0.3, y + size * 0.2);
    ctx.lineTo(x, y + size * 0.35);
  } else {
    ctx.moveTo(x - size * 0.25, y + size * 0.25);
    ctx.quadraticCurveTo(x, y + size * 0.35, x + size * 0.25, y + size * 0.25);
    ctx.quadraticCurveTo(x, y + size * 0.3, x - size * 0.25, y + size * 0.25);
  }
  ctx.closePath();
  ctx.fill();

  // Flamme au sommet
  const flameH = size * 0.6 * (0.8 + Math.sin(time * 0.02) * 0.2);
  const flameGrad = ctx.createLinearGradient(x, y - size, x, y - size - flameH);
  flameGrad.addColorStop(0, '#ffcc00');
  flameGrad.addColorStop(0.5, '#ff8800');
  flameGrad.addColorStop(1, 'transparent');
  ctx.fillStyle = flameGrad;
  ctx.beginPath();
  ctx.moveTo(x, y - size);
  ctx.quadraticCurveTo(x - size * 0.2, y - size - flameH * 0.5, x, y - size - flameH);
  ctx.quadraticCurveTo(x + size * 0.2, y - size - flameH * 0.5, x, y - size);
  ctx.fill();

  ctx.globalAlpha = 1;
};

// --- REINDEER (Noël) ---
export const reindeerRenderer: SkinRenderer = ({ ctx, x, y, size, time, colors, isGhost, isDown }) => {
  const alpha = isGhost ? 0.4 : (isDown ? 0.5 : 1);
  ctx.globalAlpha = alpha;

  // Aura festive
  drawGlowRing(ctx, x, y, size * 1.2, '#ff3366', 0.6);

  // Corps (brun)
  const g = ctx.createRadialGradient(x, y, 0, x, y, size);
  g.addColorStop(0, '#8b5a2b');
  g.addColorStop(0.7, '#5d3a1a');
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();

  // Nez rouge brillant (Rudolph)
  const nosePulse = 1 + Math.sin(time * 0.01) * 0.2;
  const noseGlow = ctx.createRadialGradient(x + size * 0.5, y, 0, x + size * 0.5, y, size * 0.4 * nosePulse);
  noseGlow.addColorStop(0, '#ff0000');
  noseGlow.addColorStop(1, 'transparent');
  ctx.fillStyle = noseGlow;
  ctx.beginPath();
  ctx.arc(x + size * 0.5, y, size * 0.25 * nosePulse, 0, Math.PI * 2);
  ctx.fill();

  // Bois (simplifiés)
  ctx.strokeStyle = '#4a2c1a';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (const side of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(x + side * size * 0.3, y - size * 0.8);
    ctx.lineTo(x + side * size * 0.7, y - size * 1.4);
    ctx.moveTo(x + side * size * 0.7, y - size * 1.4);
    ctx.lineTo(x + side * size * 1.0, y - size * 1.2);
    ctx.moveTo(x + side * size * 0.7, y - size * 1.4);
    ctx.lineTo(x + side * size * 0.5, y - size * 1.1);
    ctx.stroke();
  }

  // Cloche au cou
  const bellY = y + size * 0.6;
  const bellSwing = Math.sin(time * 0.008) * 0.15;
  ctx.fillStyle = '#ffcc00';
  ctx.beginPath();
  ctx.arc(x + bellSwing * size * 0.5, bellY, size * 0.18, 0, Math.PI * 2);
  ctx.fill();
  // Anneau de la cloche
  ctx.strokeStyle = '#ffaa00';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x + bellSwing * size * 0.5, bellY - size * 0.18, size * 0.12, 0, Math.PI);
  ctx.stroke();

  ctx.globalAlpha = 1;
};

/** ============================================================
 *  REGISTRE & FACTORY
 *  ============================================================ */

export const skinRenderers: Record<string, SkinRenderer> = {
  common: commonRenderer,
  rare: rareRenderer,
  epic: epicRenderer,
  legendary: legendaryRenderer,
  mythic: mythicRenderer,
  // Skins événementiels
  jackolantern: jackolanternRenderer,
  reindeer: reindeerRenderer,
};

/** Récupère le renderer pour une rareté/skin donné */
export function getSkinRenderer(rarityOrId: string): SkinRenderer {
  return skinRenderers[rarityOrId] || commonRenderer;
}

/** Convertit les couleurs skin (format neon-progression) en SkinColors */
export function parseSkinColors(skinColors: [string, string, string] | string[], rarity: string): SkinColors {
  const [primary, secondary, accent] = skinColors;
  // Génère une couleur glow basée sur la primary
  const glow = primary.replace(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/, 'hsl($1, 90%, 70%)')
                     .replace(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/, 'rgba($1, $2, $3, 0.6)');
  return { primary, secondary, accent, glow };
}

/** Applique un renderer avec les bonnes couleurs */
export function renderSkin(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  time: number,
  skinColors: [string, string, string],
  skinId: string,
  options: { isGhost?: boolean; isDown?: boolean; combo?: number; velocity?: { x: number; y: number } } = {}
): void {
  const colors = parseSkinColors(skinColors, skinId);
  const renderer = getSkinRenderer(skinId);
  renderer({ ctx, x, y, size, time, colors, ...options });
}