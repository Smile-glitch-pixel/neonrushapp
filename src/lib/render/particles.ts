/**
 * NEON RUSH — Système de particules avancé
 * Remplace le système basique actuel par des particules typées, configurables et performantes.
 */
export interface DetailedParticle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number; startSize: number; endSize: number;
  color: string; startColor: string; endColor: string;
  rotation: number; rotationSpeed: number;
  type: 'orb' | 'spark' | 'debris' | 'glow' | 'trail' | 'ring' | 'text';
  gravity?: number; friction?: number;
  text?: string; // for text particles
}

export interface ParticleConfig {
  count: number;
  type: DetailedParticle['type'];
  color: string;
  velocity: number;
  spread: number;
  life: number;
  size: [number, number];
  gravity?: number;
  friction?: number;
  text?: string;
}

/** Pool global de particules (réutilisé chaque frame) */
export const particlePool: DetailedParticle[] = [];

/** Spawne des particules selon une configuration */
export function spawnParticles(config: ParticleConfig, x: number, y: number): void {
  for (let i = 0; i < config.count; i++) {
    const angle = (Math.PI * 2 * i) / config.count + (Math.random() - 0.5) * config.spread;
    const speed = config.velocity * (0.5 + Math.random() * 0.5);
    particlePool.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: config.life * (0.8 + Math.random() * 0.4),
      maxLife: config.life,
      size: config.size[0],
      startSize: config.size[0],
      endSize: config.size[1],
      color: config.color,
      startColor: config.color,
      endColor: config.color.replace(/[^,]+(?=\))/, '0'),
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.2,
      type: config.type,
      gravity: config.gravity ?? (config.type === 'debris' ? 0.3 : 0),
      friction: config.friction ?? 0.98,
      text: config.text,
    });
  }
}

/** Raccourcis pour les événements de jeu courants */
export const ParticlePresets = {
  /** Collecte d'orbe */
  orbCollect: (x: number, y: number, color = '#00ffff') => {
    spawnParticles({ count: 12, type: 'spark', color, velocity: 300, spread: 0.5, life: 0.4, size: [3, 0] }, x, y);
    spawnParticles({ count: 8, type: 'glow', color, velocity: 50, spread: 1, life: 0.6, size: [8, 0] }, x, y);
    spawnParticles({ count: 6, type: 'ring', color, velocity: 100, spread: 0, life: 0.3, size: [2, 20] }, x, y);
  },

  /** Impact hazard / mort */
  hazardHit: (x: number, y: number, color = '#ff3366') => {
    spawnParticles({ count: 20, type: 'debris', color, velocity: 400, spread: 1, life: 0.8, size: [4, 1], gravity: 0.4 }, x, y);
    spawnParticles({ count: 10, type: 'spark', color: '#ff6699', velocity: 200, spread: 0.8, life: 0.5, size: [2, 0] }, x, y);
    spawnParticles({ count: 5, type: 'glow', color, velocity: 80, spread: 1, life: 0.5, size: [12, 0] }, x, y);
  },

  /** Powerup collecté */
  powerupCollect: (x: number, y: number, color = '#ffff00') => {
    spawnParticles({ count: 16, type: 'glow', color, velocity: 100, spread: 1, life: 1, size: [12, 0] }, x, y);
    spawnParticles({ count: 8, type: 'spark', color, velocity: 200, spread: 0.6, life: 0.6, size: [3, 0] }, x, y);
    spawnParticles({ count: 4, type: 'ring', color, velocity: 150, spread: 0, life: 0.4, size: [3, 25] }, x, y);
  },

  /** Revival partenaire */
  revive: (x: number, y: number, color = '#00ff88') => {
    spawnParticles({ count: 24, type: 'spark', color, velocity: 250, spread: 1, life: 0.7, size: [3, 0] }, x, y);
    spawnParticles({ count: 12, type: 'glow', color, velocity: 60, spread: 1, life: 1, size: [10, 0] }, x, y);
    spawnParticles({ count: 8, type: 'ring', color, velocity: 120, spread: 0, life: 0.5, size: [2, 30] }, x, y);
  },

  /** Combo milestone */
  comboMilestone: (x: number, y: number, text: string, color = '#ffff00') => {
    spawnParticles({ count: 1, type: 'text', color, velocity: 50, spread: 0.3, life: 1.5, size: [16, 16], text }, x, y);
    spawnParticles({ count: 15, type: 'spark', color, velocity: 180, spread: 0.8, life: 0.8, size: [2, 0] }, x, y);
  },

  /** Trail continu (pour la boule du joueur) */
  playerTrail: (x: number, y: number, color = '#00ffff') => {
    spawnParticles({ count: 2, type: 'trail', color: color + '80', velocity: 20, spread: 0.5, life: 0.3, size: [2, 0], friction: 0.9 }, x, y);
  },

  /** Vault completion */
  vaultComplete: (x: number, y: number, color = '#ffcc00') => {
    spawnParticles({ count: 30, type: 'spark', color, velocity: 350, spread: 1, life: 1, size: [4, 0] }, x, y);
    spawnParticles({ count: 15, type: 'glow', color, velocity: 80, spread: 1, life: 1.2, size: [15, 0] }, x, y);
    spawnParticles({ count: 8, type: 'ring', color, velocity: 200, spread: 0, life: 0.6, size: [3, 40] }, x, y);
  },

  /** Skin unlock / chest open */
  chestOpen: (x: number, y: number, color = '#ff66ff') => {
    spawnParticles({ count: 20, type: 'spark', color, velocity: 280, spread: 1, life: 0.8, size: [3, 0] }, x, y);
    spawnParticles({ count: 10, type: 'glow', color, velocity: 50, spread: 1, life: 1, size: [12, 0] }, x, y);
    spawnParticles({ count: 6, type: 'ring', color, velocity: 150, spread: 0, life: 0.5, size: [2, 35] }, x, y);
  },
};

/** Met à jour toutes les particules (appelé chaque frame) */
export function updateParticles(dt: number): void {
  for (let i = particlePool.length - 1; i >= 0; i--) {
    const p = particlePool[i];
    p.life -= dt;
    if (p.life <= 0) {
      particlePool.splice(i, 1);
      continue;
    }

    const t = 1 - p.life / p.maxLife;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= p.friction ?? 1;
    p.vy *= p.friction ?? 1;
    p.vy += (p.gravity ?? 0) * dt * 100; // gravity en px/s²
    p.size = p.startSize + (p.endSize - p.startSize) * t;
    p.rotation += p.rotationSpeed * dt;
  }
}

/** Dessine toutes les particules */
export function drawParticles(ctx: CanvasRenderingContext2D): void {
  for (const p of particlePool) {
    const t = 1 - p.life / p.maxLife;
    const alpha = 1 - t;

    ctx.globalAlpha = alpha;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);

    switch (p.type) {
      case 'spark': {
        // Éclat directionnel (forme de losange allongé)
        const s = p.size;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-s, 0);
        ctx.lineTo(s * 0.3, -s * 0.5);
        ctx.lineTo(s, 0);
        ctx.lineTo(s * 0.3, s * 0.5);
        ctx.closePath();
        ctx.fill();
        break;
      }
      case 'glow': {
        // Halo radial doux
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, p.size * 2);
        g.addColorStop(0, p.color);
        g.addColorStop(1, p.color.replace(/[^,]+(?=\))/, '0'));
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 2, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'trail': {
        // Segment de trail
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-p.size * 2, 0);
        ctx.lineTo(p.size * 2, 0);
        ctx.stroke();
        break;
      }
      case 'ring': {
        // Anneau expansif
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * 0.5);
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'text': {
        // Texte flottant (combo, score)
        if (p.text) {
          ctx.fillStyle = p.color;
          ctx.font = `bold ${p.size}px "Orbitron", sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(p.text, 0, 0);
        }
        break;
      }
      case 'debris':
      default: {
        // Débris / particule basique
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

/** Vide le pool (changement de niveau, game over, etc.) */
export function clearParticles(): void {
  particlePool.length = 0;
}

/** Retourne le nombre de particules actives (pour debug/profiling) */
export function getParticleCount(): number {
  return particlePool.length;
}