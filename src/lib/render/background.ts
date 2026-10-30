/**
 * NEON RUSH — Arrière-plan multi-layers avec parallax
 * Remplace le fond statique par un environnement vivant et atmosphérique.
 */

export interface BGElement {
  x: number; y: number;        // Position normalisée 0-1
  size: number;                // Taille de base
  type: 'grid' | 'star' | 'nebula' | 'line' | 'circuit' | 'particle';
  phase: number;               // Phase d'animation
  rotation: number;            // Rotation initiale
  speed: number;               // Vitesse propre
  colorOffset: number;         // Décalage de teinte
}

export interface BGLayer {
  speed: number;               // Facteur de parallax (0.01 = lointain, 0.1 = proche)
  elements: BGElement[];
  baseColor: string;           // Couleur de base HSL
  opacity: number;             // Opacité globale
  blendMode?: GlobalCompositeOperation; // Mode de fusion
}

/** Crée un élément de fond aléatoire */
function createBGElement(type: BGElement['type']): BGElement {
  return {
    x: Math.random(),
    y: Math.random(),
    size: 0.5 + Math.random() * 2.5,
    type,
    phase: Math.random() * Math.PI * 2,
    rotation: Math.random() * Math.PI * 2,
    speed: 0.00005 + Math.random() * 0.0002,
    colorOffset: Math.random() * 60 - 30,
  };
}

/** Crée toutes les layers de fond */
export function createBackground(layerCount: number = 5): BGLayer[] {
  const layerConfigs: { types: BGElement['type'][]; count: number; speed: number; opacity: number; hue: number }[] = [
    // Layer 0: Trés loin - étoiles fixes
    { types: ['star'], count: 80, speed: 0.002, opacity: 0.15, hue: 220 },
    // Layer 1: Loin - nébuleuses lentes
    { types: ['nebula'], count: 8, speed: 0.005, opacity: 0.12, hue: 260 },
    // Layer 2: Moyen - grille/circuit qui défile
    { types: ['grid', 'circuit'], count: 25, speed: 0.015, opacity: 0.08, hue: 190 },
    // Layer 3: Proche - lignes de flux
    { types: ['line'], count: 15, speed: 0.03, opacity: 0.1, hue: 300 },
    // Layer 4: Très proche - particules subtiles
    { types: ['particle'], count: 30, speed: 0.05, opacity: 0.06, hue: 30 },
  ];

  return layerConfigs.slice(0, layerCount).map((cfg, i) => ({
    speed: cfg.speed,
    opacity: cfg.opacity,
    baseColor: `hsl(${cfg.hue}, 50%, ${10 + i * 5}%)`,
    blendMode: i <= 1 ? 'lighter' : 'source-over',
    elements: Array.from({ length: cfg.count }, () =>
      createBGElement(cfg.types[Math.floor(Math.random() * cfg.types.length)])
    ),
  }));
}

/** Dessine un élément individuel */
function drawBGElement(
  ctx: CanvasRenderingContext2D,
  el: BGElement,
  layer: BGLayer,
  time: number,
  w: number,
  h: number,
  parallaxX: number,
  parallaxY: number
): void {
  const x = (el.x * w + parallaxX * layer.speed * w) % w;
  const y = (el.y * h + parallaxY * layer.speed * h) % h;
  const animatedRotation = el.rotation + time * el.speed;
  const pulseSize = el.size * (1 + Math.sin(time * 0.001 + el.phase) * 0.1);

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(animatedRotation);
  ctx.globalAlpha = layer.opacity;

  // Couleur avec variation par élément
  const hueMatch = layer.baseColor.match(/hsl\((\d+)/);
  const baseHue = hueMatch ? parseInt(hueMatch[1]) : 220;
  const hue = (baseHue + el.colorOffset + Math.sin(time * 0.0005 + el.phase) * 10) % 360;
  const color = `hsl(${hue}, 70%, 60%)`;
  const colorDim = `hsla(${hue}, 50%, 40%, ${layer.opacity})`;

  switch (el.type) {
    case 'star': {
      // Étoile à 4-6 branches
      const branches = 4 + Math.floor(el.phase * 2) % 3;
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let i = 0; i < branches; i++) {
        const a = (i / branches) * Math.PI * 2;
        const r = i % 2 === 0 ? pulseSize * 1.5 : pulseSize * 0.6;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.stroke();
      // Core brillant
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, pulseSize * 0.3, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'nebula': {
      // Nuage de gaz diffus
      const g = ctx.createRadialGradient(0, 0, 0, 0, 0, pulseSize * 8);
      g.addColorStop(0, `hsla(${hue}, 60%, 70%, ${layer.opacity * 0.3})`);
      g.addColorStop(0.5, `hsla(${hue}, 50%, 50%, ${layer.opacity * 0.1})`);
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, pulseSize * 8, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'grid': {
      // Croix de grille néon
      ctx.strokeStyle = colorDim;
      ctx.lineWidth = 0.4;
      ctx.beginPath();
      ctx.moveTo(-pulseSize, -pulseSize); ctx.lineTo(pulseSize, pulseSize);
      ctx.moveTo(pulseSize, -pulseSize); ctx.lineTo(-pulseSize, pulseSize);
      ctx.stroke();
      break;
    }
    case 'circuit': {
      // Motif circuit imprimé
      ctx.strokeStyle = colorDim;
      ctx.lineWidth = 0.5;
      ctx.lineCap = 'square';
      const s = pulseSize;
      ctx.beginPath();
      // Pattern L-shape
      ctx.moveTo(-s, -s); ctx.lineTo(s, -s); ctx.lineTo(s, s);
      ctx.moveTo(-s, s); ctx.lineTo(-s, -s); ctx.lineTo(s, s);
      ctx.stroke();
      // Node central
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'line': {
      // Ligne de flux directionnelle
      ctx.strokeStyle = color;
      ctx.lineWidth = 0.6;
      ctx.lineCap = 'round';
      const len = pulseSize * 4;
      ctx.beginPath();
      ctx.moveTo(-len * 0.5, 0);
      ctx.lineTo(len * 0.5, 0);
      ctx.stroke();
      // Pointe
      ctx.beginPath();
      ctx.moveTo(len * 0.5, 0);
      ctx.lineTo(len * 0.3, -len * 0.15);
      ctx.moveTo(len * 0.5, 0);
      ctx.lineTo(len * 0.3, len * 0.15);
      ctx.stroke();
      break;
    }
    case 'particle': {
      // Micro-particule flottante
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(0.5, pulseSize * 0.3), 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/** Dessine tout l'arrière-plan */
export function drawBackground(
  ctx: CanvasRenderingContext2D,
  bg: BGLayer[],
  time: number,
  w: number,
  h: number,
  cameraX: number = 0,
  cameraY: number = 0
): void {
  // Fond de base très sombre
  ctx.fillStyle = '#030308';
  ctx.fillRect(0, 0, w, h);

  // Grille de référence subtile (layer -1)
  drawReferenceGrid(ctx, w, h, time, cameraX, cameraY);

  // Dessine chaque layer
  for (const layer of bg) {
    if (layer.blendMode) {
      ctx.globalCompositeOperation = layer.blendMode;
    }
    for (const el of layer.elements) {
      drawBGElement(ctx, el, layer, time, w, h, cameraX / w, cameraY / h);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // Vignette subtile sur les bords
  drawVignette(ctx, w, h);
}

/** Grille de référence qui défile doucement */
function drawReferenceGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  time: number,
  cameraX: number,
  cameraY: number
): void {
  const gridSize = 80;
  const offsetX = (cameraX * 0.02 + time * 0.005) % gridSize;
  const offsetY = (cameraY * 0.02 + time * 0.003) % gridSize;

  ctx.strokeStyle = 'rgba(0, 200, 255, 0.02)';
  ctx.lineWidth = 0.3;

  // Lignes verticales
  for (let x = -offsetX; x < w + gridSize; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  // Lignes horizontales
  for (let y = -offsetY; y < h + gridSize; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
}

/** Vignette aux coins */
function drawVignette(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.7);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(0.7, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.3)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

/** Met à jour les éléments animés (appelé si nécessaire) */
export function updateBackground(bg: BGLayer[], dt: number): void {
  // Les animations sont basées sur le temps absolu dans drawBackground
  // Cette fonction existe pour cohérence avec l'API du pipeline
}

/** Effet "scanlines" CRT optionnel */
export function drawScanlines(ctx: CanvasRenderingContext2D, w: number, h: number, intensity: number = 0.03): void {
  ctx.save();
  ctx.globalAlpha = intensity;
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  for (let y = 0; y < h; y += 4) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
}

/** Effet "chromatic aberration" subtil sur les bords */
export function drawChromaticAberration(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: HTMLCanvasElement,
  w: number,
  h: number,
  intensity: number = 1
): void {
  // Dessine les canaux R et B décalés
  ctx.globalCompositeOperation = 'lighter';

  // Canal R (décalé à droite)
  ctx.save();
  ctx.filter = 'sepia(1) hue-rotate(-90deg) saturate(5)';
  ctx.globalAlpha = 0.15 * intensity;
  ctx.drawImage(sourceCanvas, intensity, 0);
  ctx.restore();

  // Canal B (décalé à gauche)
  ctx.save();
  ctx.filter = 'sepia(1) hue-rotate(90deg) saturate(5)';
  ctx.globalAlpha = 0.15 * intensity;
  ctx.drawImage(sourceCanvas, -intensity, 0);
  ctx.restore();

  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
}