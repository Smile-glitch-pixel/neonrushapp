# Mise à jour majeure NEON RUSH

Objectif : rendre le jeu vraiment fluide sur mobile, rééquilibrer le gameplay, refondre le mode Zen, et ajouter un vrai système de comptes avec synchronisation cloud — sans casser l'existant (skins, pass, langues, modes, partage, classements locaux).

## 1. Priorité absolue — Optimisation mobile

**Contrôles / latence**
- Passer les listeners tactiles en `Pointer Events` (`pointerdown`/`pointermove`) avec `touch-action: none` sur le canvas, capture du pointeur, `passive: false` uniquement où nécessaire.
- Supprimer le lissage `x += (tx - x) * 0.22` sur mobile → suivi 1:1 du doigt (avec micro-lissage optionnel < 1 frame) pour zéro latence perçue.
- Utiliser `requestAnimationFrame` pour la lecture de la dernière position (pas de setState par move).

**Rendu / perfs graphiques**
- Cap DPR intelligent (`min(devicePixelRatio, 2)` déjà présent, mais forcer un vrai backing store net : recalculer la taille au vrai DPR, dessiner les projectiles avec des cercles pleins + halo compact au lieu de gros blurs (qui rendent flou sur écran haute densité).
- Pré-rendre les sprites (orb, hazard, power, joueur) sur des `OffscreenCanvas` une seule fois → `drawImage` dans la boucle (fin du flou rose, boost FPS).
- Réduire les particules sur mobile (détection via `matchMedia('(pointer: coarse)')`), désactiver le shake léger.
- Boucle : accumuler `dt`, plafonner à 32 ms, éviter les `setState` par frame (score/combo → refs + flush 4×/s dans un state léger).

## 2. Rééquilibrage gameplay

- Classique : baisser `hazardChance` 0.42 → 0.32, spawn rate min 220 → 260, spawn double 25 % → 15 %.
- Hardcore : conserver la pression, léger buff de récompenses.
- Récompenses proportionnelles à la difficulté :
  - `coinsMult`: zen 0.5, classic 1, blitz 1.15, hardcore 1.6
  - `xpMult`: idem
  - Appliqué dans `finishRun` sur `earnedCoins` / `earnedXP`.

## 3. Refonte mode Zen

- Ajouter quelques hazards très rares (`hazardChance` ≈ 0.05, spawn plus lent) → risque minimal mais réel.
- Classement Zen équitable (les scores comptent pour le rang mondial seulement si un vrai risque existe).
- Bouton "Quitter" visible en HUD pendant le run (retour direct au menu, sans game over, sans récompense de fuite).

## 4. Comptes joueurs et synchronisation cloud

**Prérequis : activer Lovable Cloud** (nécessaire pour auth + base de données).

**Fournisseurs**
- **Google** : natif Lovable Cloud (activé via `configure_social_auth`).
- **Email + mot de passe** : natif.
- **Discord** : non supporté nativement par Lovable Cloud. Deux options :
  - (a) je le mets en "bientôt disponible" et je livre Google + Email tout de suite ;
  - (b) je bascule le projet sur l'intégration Supabase directe pour activer Discord OAuth dans le dashboard Supabase.
  → *Je propose (a) par défaut pour ne rien retarder ; dis-moi si tu préfères (b).*

**Modèle de données (cloud)**
- Table `profiles` (id → auth.users, display_name, avatar_url).
- Table `player_state` (user_id PK, coins, xp, claimed jsonb, owned jsonb, equipped, best_by_mode jsonb, settings jsonb, updated_at).
- RLS : chaque user ne lit/écrit que sa ligne. Trigger `on_auth_user_created` → insère profil + state vide.

**Synchronisation**
- Au login : `pull` du cloud → merge avec le local (max des bests, union des skins, max coins/xp) → `push`.
- En jeu : après chaque run + achat/équipement/claim → debounce 800 ms → `push`.
- Multi-appareil : `updated_at` sert d'arbitre ; conflit simple = merge côté client (max/union).

**UI**
- Écran `/auth` (Google + Email, "Continuer sans compte" reste possible → mode invité = localStorage actuel).
- Menu principal : avatar / bouton "Se connecter" ou "Mon compte" (déconnexion, ID visible).

## Détails techniques

- `src/components/NeonRush.tsx` : refactor input (Pointer Events), rendu sprites offscreen, cap des setState, HUD "Quitter" pour Zen, multiplicateurs de récompense.
- `src/lib/neon-progression.ts` : ajouter `REWARD_MULT[mode]`, helpers `mergeProgression(local, remote)`.
- Nouveau : `src/lib/player-sync.functions.ts` (`pullState`, `pushState` via `requireSupabaseAuth`).
- Nouveau : `src/routes/auth.tsx` (Google + Email + retour au jeu).
- Migration SQL : `profiles`, `player_state`, RLS, GRANTs, trigger signup.
- `configure_social_auth` → Google.
- Route `/` : détecter session, hydrater `prog` depuis cloud si connecté.

## Ordre de livraison
1. Optim mobile + rééquilibrage + Zen (aucune dépendance externe, livré immédiatement).
2. Activation Lovable Cloud + auth Google/Email + sync cloud + écran compte.

Confirme-moi le point Discord (option a ou b) et je lance.
