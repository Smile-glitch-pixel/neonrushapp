/**
 * NEON RUSH — Système de trails (traînées) pour le joueur
 * Trails fluides, colorés, avec fade progressif.
 */

export interface TrailPoint {
  x: number;
  y: number;
  time: number;
  size: number;
  color: string;
  alpha: number;
}

const trailPool: TrailPoint[] = [];
const MAX_TRAIL_POINTS = 60;

/** Ajoute un point au trail du joueur */
export function addTrailPoint(
  x: number,
  y: number,
  color: string = '#00ffff',
  size: number = 1
): void {
  // Limite la pool
  if (trailPool.length >= MAX_TRAIL_POINTS) {
    trailPool.shift();
  }

  trailPool.push({
    x,
    y,
    time: performance.now(),
    size,
    color,
    alpha: 1,
  });
}

/** Met à jour le trail (fade out) */
export function updateTrail(dt: number, maxAge: number = 0.8): void {
  const now = performance.now();
  const maxAgeMs = maxAge * 1000;

  for (let i = trailPool.length - 1; i >= 0; i--) {
    const p = trailPool[i];
    const age = (now - p.time) / 1000;

    if (age > maxAge) {
      trailPool.splice(i, 1);
      continue;
    }

    const t = age / maxAge;
    p.alpha = 1 - t;
    p.size = p.size * (1 - t * 0.5);
  }
}

/** Dessine le trail complet */
export function drawTrail(
  ctx: CanvasRenderingContext2D,
  options: {
    gradient?: boolean;
    glow?: boolean;
    capStyle?: CanvasLineCap;
    joinStyle?: CanvasLineJoin;
  } = {}
): void {
  if (trailPool.length < 2) return;

  const { gradient = true, glow = true, capStyle = 'round', joinStyle = 'round' } = options;

  ctx.save();
  ctx.lineCap = capStyle;
  ctx.lineJoin = joinStyle;

  if (glow) {
    // Couche de glow derrière
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(0, 255, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(trailPool[0].x, trailPool[0].y);
    for (let i = 1; i < trailPool.length; i++) {
      const p = trailPool[i];
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  // Trail principal avec gradient de couleur
  if (gradient && trailPool.length > 2) {
    // Dessine segment par segment pour le gradient
    for (let i = 1; i < trailPool.length; i++) {
      const p0 = trailPool[i - 1];
      const p1 = trailPool[i];

      const midAlpha = (p0.alpha + p1.alpha) * 0.5;
      if (midAlpha < 0.05) continue;

      const g = ctx.createLinearGradient(p0.x, p0.y, p1.x, p1.y);
      g.addColorStop(0, p0.color.replace(/[^,]+(?=\))/, (p0.alpha * 0.8).toFixed(2)));
      g.addColorStop(1, p1.color.replace(/[^,]+(?=\))/, (p1.alpha * 0.8).toFixed(2)));

      ctx.strokeStyle = g;
      ctx.lineWidth = Math.max(1, (p0.size + p1.size) * 0.5 * midAlpha);
      ctx.globalAlpha = midAlpha;

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else {
    // Version simple : une seule ligne
    ctx.strokeStyle = trailPool[trailPool.length - 1].color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = trailPool[trailPool.length - 1].alpha * 0.5;
    ctx.beginPath();
    ctx.moveTo(trailPool[0].x, trailPool[0].y);
    for (let i = 1; i < trailPool.length; i++) {
      ctx.lineTo(trailPool[i].x, trailPool[i].y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

/** Dessine un trail "ruban" (plus large, avec forme) */
export function drawRibbonTrail(
  ctx: CanvasRenderingContext2D,
  color: string = '#00ffff',
  width: number = 12
): void {
  if (trailPool.length < 3) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  // Construit la géométrie du ruban
  const vertices: { x: number; y: number; nx: number; ny: number; alpha: number }[] = [];

  for (let i = 0; i < trailPool.length; i++) {
    const p = trailPool[i];
    let nx = 0, ny = 0;

    if (i === 0) {
      // Premier point : normale vers le suivant
      const next = trailPool[1];
      nx = -(next.y - p.y);
      ny = next.x - p.x;
    } else if (i === trailPool.length - 1) {
      // Dernier point : normale vers le précédent
      const prev = trailPool[i - 1];
      nx = -(p.y - prev.y);
      ny = p.x - prev.x;
    } else {
      // Milieu : moyenne
      const prev = trailPool[i - 1];
      const next = trailPool[i + 1];
      nx = -(next.y - prev.y) * 0.5;
      ny = (next.x - prev.x) * 0.5;
    }

    const len = Math.hypot(nx, ny);
    if (len > 0) {
      nx /= len;
      ny /= len;
    }

    vertices.push({ x: p.x, y: p.y, nx, ny, alpha: p.alpha });
  }

  // Dessine le ruban comme une série de quadrilatères
  for (let i = 1; i < vertices.length; i++) {
    const v0 = vertices[i - 1];
    const v1 = vertices[i];

    const midAlpha = (v0.alpha + v1.alpha) * 0.5;
    if (midAlpha < 0.05) continue;

    const w0 = width * v0.alpha;
    const w1 = width * v1.alpha;

    const g = ctx.createLinearGradient(v0.x, v0.y, v1.x, v1.y);
    g.addColorStop(0, color.replace(/[^,]+(?=\))/, (v0.alpha * 0.4).toFixed(2)));
    g.addColorStop(1, color.replace(/[^,]+(?=\))/, (v1.alpha * 0.4).toFixed(2)));

    ctx.fillStyle = g;
    ctx.globalAlpha = midAlpha;

    ctx.beginPath();
    ctx.moveTo(v0.x - v0.nx * w0, v0.y - v0.ny * w0);
    ctx.lineTo(v1.x - v1.nx * w1, v1.y - v1.ny * w1);
    ctx.lineTo(v1.x + v1.nx * w1, v1.y + v1.ny * w1);
    ctx.lineTo(v0.x + v0.nx * w0, v0.y + v0.ny * w0);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

/** Vide le trail */
export function clearTrail(): void {
  trailPool.length = 0;
}

/** Retourne les points actuels (pour debug/autres usages) */
export function getTrailPoints(): ReadonlyArray<TrailPoint> {
  return trailPool;
}

/** Configure la taille max du trail */
export function setMaxTrailPoints(max: number): void {
  // Note: MAX_TRAIL_POINTS est const, mais on peut tronquer la pool
  while (trailPool.length > max) {
    trailPool.shift();
  }
}