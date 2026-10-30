/**
 * NEON RUSH — Rendu des entités de jeu
 * Orbes, hazards, vaults, powerups, ghost partenaire, etc.
 */

import type { CanvasRenderingContext2D } from 'react';
import { renderSkin, parseSkinColors } from './skins';

export interface RenderEntity {
  x: number;
  y: number;
  r: number;           // rayon
  type: 'orb' | 'hazard' | 'vault' | 'powerup' | 'ghost' | 'player';
  color?: string;
  color2?: string;
  color3?: string;
  skinColors?: [string, string, string];
  skinId?: string;
  rotation?: number;
  pulse?: number;
  variant?: string;    // sous-type (ex: hazard type, powerup kind)
  progress?: number;   // 0-1 pour vault
  isGhost?: boolean;
  isDown?: boolean;
  name?: string;
  combo?: number;
  velocity?: { x: number; y: number };
}

/** Dessine une orbe collectible */
export function drawOrb(
  ctx: CanvasRenderingContext2D,
  e: RenderEntity,
  time: number
): void {
  const { x, y, r, color = '#00ffff', color2 = '#0088ff', pulse = 1 } = e;
  const p = 1 + Math.sin(time * 0.006 + (e.rotation || 0)) * 0.15 * pulse;
  const radius = r * p;

  // Glow externe
  const glow = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 2.5);
  glow.addColorStop(0, color + '40');
  glow.addColorStop(0.5, color + '15');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Anneau rotatif
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 0.001);
  ctx.strokeStyle = color2;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Corps principal
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color);
  g.addColorStop(0.6, color2);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Core brillant
  const core = ctx.createRadialGradient(x, y, 0, x, y, radius * 0.5);
  core.addColorStop(0, '#ffffff');
  core.addColorStop(0.5, color);
  core.addColorStop(1, 'transparent');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // Éclat central
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.15, 0, Math.PI * 2);
  ctx.fill();
}

/** Dessine un hazard (danger) */
export function drawHazard(
  ctx: CanvasRenderingContext2D,
  e: RenderEntity,
  time: number
): void {
  const { x, y, r, variant = 'spike', color = '#ff3366', color2 = '#cc0033', rotation = 0 } = e;

  switch (variant) {
    case 'spike': {
      // Pic rotatif
      const spikes = 5;
      const outerR = r * 1.2;
      const innerR = r * 0.4;

      // Glow danger
      const glow = ctx.createRadialGradient(x, y, 0, x, y, outerR * 1.5);
      glow.addColorStop(0, color + '30');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, outerR * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Corps du pic
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation + time * 0.002);

      const g = ctx.createLinearGradient(-outerR, -outerR, outerR, outerR);
      g.addColorStop(0, color);
      g.addColorStop(1, color2);
      ctx.fillStyle = g;

      ctx.beginPath();
      for (let i = 0; i < spikes; i++) {
        const a = (i / spikes) * Math.PI * 2;
        const aNext = ((i + 1) / spikes) * Math.PI * 2;
        const aMid = a + Math.PI / spikes;

        if (i === 0) {
          ctx.moveTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
        } else {
          ctx.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
        }
        ctx.lineTo(Math.cos(aMid) * innerR, Math.sin(aMid) * innerR);
      }
      ctx.closePath();
      ctx.fill();

      // Core
      const coreG = ctx.createRadialGradient(0, 0, 0, 0, 0, innerR);
      coreG.addColorStop(0, '#ff6688');
      coreG.addColorStop(1, color2);
      ctx.fillStyle = coreG;
      ctx.beginPath();
      ctx.arc(0, 0, innerR, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
      break;
    }

    case 'laser': {
      // Laser horizontal/vertical
      const length = r * 8;
      const width = r * 0.6;

      // Avertissement (ligne fine avant tir)
      const warnAlpha = (Math.sin(time * 0.02) + 1) * 0.5 * 0.3;
      ctx.strokeStyle = `rgba(255, 50, 100, ${warnAlpha})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([10, 5]);
      ctx.lineDashOffset = -time * 0.1;
      ctx.beginPath();
      if (rotation === 0) {
        ctx.moveTo(x - length, y);
        ctx.lineTo(x + length, y);
      } else {
        ctx.moveTo(x, y - length);
        ctx.lineTo(x, y + length);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Faisceau principal
      const beamG = ctx.createLinearGradient(
        x - (rotation === 0 ? length : 0),
        y - (rotation !== 0 ? length : 0),
        x + (rotation === 0 ? length : 0),
        y + (rotation !== 0 ? length : 0)
      );
      beamG.addColorStop(0, 'transparent');
      beamG.addColorStop(0.1, color + '80');
      beamG.addColorStop(0.5, '#ff6688');
      beamG.addColorStop(0.9, color + '80');
      beamG.addColorStop(1, 'transparent');

      ctx.fillStyle = beamG;
      ctx.beginPath();
      if (rotation === 0) {
        ctx.rect(x - length, y - width, length * 2, width * 2);
      } else {
        ctx.rect(x - width, y - length, width * 2, length * 2);
      }
      ctx.fill();
      break;
    }

    case 'orbiter': {
      // Hazard qui orbite autour d'un point
      // Dessiné comme un anneau avec des segments
      const segments = 8;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rotation + time * 0.003);

      for (let i = 0; i < segments; i++) {
        const a = (i / segments) * Math.PI * 2;
        const active = Math.sin(time * 0.01 + i) > 0;
        if (!active) continue;

        ctx.fillStyle = active ? color : color2;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * r * 1.5, Math.sin(a) * r * 1.5, r * 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      break;
    }

    default: {
      // Cercle danger basique
      const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.5);
      glow.addColorStop(0, color + '40');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, r * 1.5, 0, Math.PI * 2);
      ctx.fill();

      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, color2);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

/** Dessine un vault (zone de scoring) */
export function drawVault(
  ctx: CanvasRenderingContext2D,
  e: RenderEntity,
  time: number
): void {
  const { x, y, r, progress = 0, color = '#00ff88', color2 = '#00cc66' } = e;

  // Fond de la vault
  const bgG = ctx.createRadialGradient(x, y, 0, x, y, r * 1.2);
  bgG.addColorStop(0, 'rgba(0, 20, 10, 0.5)');
  bgG.addColorStop(1, 'transparent');
  ctx.fillStyle = bgG;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.2, 0, Math.PI * 2);
  ctx.fill();

  // Anneau de progression
  const ringR = r * 1.1;
  ctx.strokeStyle = 'rgba(0, 255, 136, 0.3)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(x, y, ringR, 0, Math.PI * 2);
  ctx.stroke();

  // Progression
  if (progress > 0) {
    const progG = ctx.createLinearGradient(
      x - ringR, y - ringR, x + ringR, y + ringR
    );
    progG.addColorStop(0, color);
    progG.addColorStop(1, color2);
    ctx.strokeStyle = progG;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, y, ringR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();
  }

  // Icône centre (flèche vers le bas ou checkmark)
  ctx.fillStyle = progress >= 1 ? '#00ff88' : 'rgba(0, 255, 136, 0.7)';
  ctx.font = `bold ${r * 0.8}px "Orbitron", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(progress >= 1 ? '✓' : '↓', x, y + r * 0.1);

  // Particules d'ambiance
  for (let i = 0; i < 4; i++) {
    const a = time * 0.001 + i * Math.PI / 2;
    const px = x + Math.cos(a) * r * 0.7;
    const py = y + Math.sin(a) * r * 0.7;
    const alpha = 0.3 + Math.sin(time * 0.005 + i) * 0.2;
    ctx.fillStyle = `rgba(0, 255, 136, ${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Dessine un powerup */
export function drawPowerup(
  ctx: CanvasRenderingContext2D,
  e: RenderEntity,
  time: number
): void {
  const { x, y, r, variant = 'shield', color = '#ffff00', color2 = '#ffcc00', rotation = 0 } = e;
  const pulse = 1 + Math.sin(time * 0.008) * 0.2;
  const radius = r * pulse;

  // Glow commun
  const glow = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 2);
  glow.addColorStop(0, color + '60');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
  ctx.fill();

  // Anneau rotatif
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(time * 0.002);
  ctx.strokeStyle = color2;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 1.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Symbole selon le type
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  const symbolColor = '#000';
  ctx.fillStyle = symbolColor;
  ctx.strokeStyle = symbolColor;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  switch (variant) {
    case 'shield': {
      // Bouclier hexagonale
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = i * Math.PI / 3 - Math.PI / 6;
        const px = Math.cos(a) * radius * 0.7;
        const py = Math.sin(a) * radius * 0.7;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      // Ligne centrale
      ctx.beginPath();
      ctx.moveTo(0, -radius * 0.7);
      ctx.lineTo(0, radius * 0.7);
      ctx.stroke();
      break;
    }
    case 'magnet': {
      // Aimant (U shape)
      ctx.beginPath();
      ctx.moveTo(-radius * 0.5, -radius * 0.6);
      ctx.lineTo(-radius * 0.5, radius * 0.4);
      ctx.quadraticCurveTo(0, radius * 0.7, radius * 0.5, radius * 0.4);
      ctx.lineTo(radius * 0.5, -radius * 0.6);
      ctx.stroke();
      // Pôles
      ctx.fillStyle = '#ff3366';
      ctx.beginPath();
      ctx.arc(-radius * 0.5, -radius * 0.6, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#00ffff';
      ctx.beginPath();
      ctx.arc(radius * 0.5, -radius * 0.6, 2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'slowmo': {
      // Horloge
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.6, 0, Math.PI * 2);
      ctx.stroke();
      // Aiguilles
      const hAngle = (time * 0.0005) % (Math.PI * 2);
      const mAngle = (time * 0.005) % (Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.sin(hAngle) * radius * 0.4, -Math.cos(hAngle) * radius * 0.4);
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.sin(mAngle) * radius * 0.55, -Math.cos(mAngle) * radius * 0.55);
      ctx.stroke();
      break;
    }
    case 'x2': {
      // Multiplicateur
      ctx.font = `bold ${radius * 1.2}px "Orbitron", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('×2', 0, radius * 0.1);
      break;
    }
    case 'life': {
      // Cœur
      ctx.beginPath();
      const hr = radius * 0.5;
      ctx.moveTo(0, hr * 0.3);
      ctx.bezierCurveTo(-hr, -hr * 0.5, -hr, -hr * 1.2, 0, -hr * 0.3);
      ctx.bezierCurveTo(hr, -hr * 1.2, hr, -hr * 0.5, 0, hr * 0.3);
      ctx.fill();
      break;
    }
    case 'ghost': {
      // Fantôme (phase)
      ctx.globalAlpha = 0.5 + Math.sin(time * 0.01) * 0.3;
      ctx.beginPath();
      ctx.arc(0, 0, radius * 0.6, Math.PI, 0);
      ctx.lineTo(radius * 0.6, radius * 0.4);
      for (let i = 0; i < 3; i++) {
        const wx = -radius * 0.6 + (i + 0.5) * radius * 0.4;
        ctx.quadraticCurveTo(wx, radius * 0.8, wx + radius * 0.2, radius * 0.4);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      // Yeux
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-radius * 0.2, -radius * 0.1, 1.5, 0, Math.PI * 2);
      ctx.arc(radius * 0.2, -radius * 0.1, 1.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
  ctx.restore();
}

/** Dessine le ghost du partenaire (Duo) */
export function drawGhost(
  ctx: CanvasRenderingContext2D,
  e: RenderEntity,
  time: number
): void {
  const { x, y, r, skinColors, skinId = 'rare', isDown, name } = e;
  const alpha = isDown ? 0.3 : 0.6;

  ctx.globalAlpha = alpha;

  // Aura ghost
  const glow = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 2);
  glow.addColorStop(0, 'rgba(0, 255, 255, 0.2)');
  glow.addColorStop(1, 'transparent');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 2, 0, Math.PI * 2);
  ctx.fill();

  // Render la skin si disponible
  if (skinColors) {
    const colors = parseSkinColors(skinColors, skinId);
    renderSkin(ctx, x, y, r, time, skinColors, skinId, { isGhost: true, isDown });
  } else {
    // Fallback simple
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, '#00ffff');
    g.addColorStop(0.5, '#0088ff');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Nom au-dessus
  if (name) {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#00ffff';
    ctx.font = 'bold 10px "Orbitron", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(name, x, y - r * 1.5);
  }

  // Indicateur "DOWN"
  if (isDown) {
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#ff3366';
    ctx.font = 'bold 9px "Orbitron", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText('DOWN', x, y + r * 1.3);
  }

  ctx.globalAlpha = 1;
}

/** Dessine le joueur principal */
export function drawPlayer(
  ctx: CanvasRenderingContext2D,
  e: RenderEntity,
  time: number
): void {
  const { x, y, r, skinColors, skinId = 'common', isDown, combo } = e;

  // Trail sera dessiné séparément

  // Render la skin
  if (skinColors) {
    renderSkin(ctx, x, y, r, time, skinColors, skinId, { isDown, combo });
  } else {
    // Fallback
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, '#00ffff');
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Indicateur combo au-dessus
  if (combo && combo > 1) {
    ctx.save();
    ctx.translate(x, y - r * 1.8);
    const scale = 1 + Math.sin(time * 0.01) * 0.1;
    ctx.scale(scale, scale);
    ctx.fillStyle = combo > 10 ? '#ffcc00' : '#ffff00';
    ctx.font = `bold ${Math.min(12 + combo, 20)}px "Orbitron", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Outline
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeText(`×${combo}`, 0, 0);
    ctx.fillText(`×${combo}`, 0, 0);
    ctx.restore();
  }
}

/** Dispatcher principal pour dessiner n'importe quelle entité */
export function drawEntity(
  ctx: CanvasRenderingContext2D,
  entity: RenderEntity,
  time: number
): void {
  switch (entity.type) {
    case 'orb': drawOrb(ctx, entity, time); break;
    case 'hazard': drawHazard(ctx, entity, time); break;
    case 'vault': drawVault(ctx, entity, time); break;
    case 'powerup': drawPowerup(ctx, entity, time); break;
    case 'ghost': drawGhost(ctx, entity, time); break;
    case 'player': drawPlayer(ctx, entity, time); break;
  }
}