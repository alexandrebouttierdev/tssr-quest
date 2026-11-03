/**
 * Modèle de données partagé par toutes les couches (moteur, interface, monde).
 *
 * Ce module ne contient que des types et des constantes : il ne dépend de rien
 * et peut être importé partout, y compris par `core/store` et `core/events`.
 */

/** Les huit compétences du joueur (docs/01-game-design.md). */
export const SKILL_IDS = [
  'support',
  'reseau',
  'windows',
  'linux',
  'virtualisation',
  'securite',
  'scripting',
  'sauvegarde',
] as const;

/** Identifiant d'une compétence. */
export type SkillId = (typeof SKILL_IDS)[number];

/** Les cinq services de LabCorp qui ont une jauge de réputation. */
export const SERVICE_IDS = [
  'accueil',
  'comptabilite',
  'commercial',
  'production',
  'direction',
] as const;

/** Identifiant d'un service de LabCorp. */
export type ServiceId = (typeof SERVICE_IDS)[number];

/** Pronoms choisis par le joueur, utilisés dans les dialogues. */
export type Pronouns = 'il' | 'elle' | 'iel';

/** Direction vers laquelle regarde un personnage. */
export type Facing = 'up' | 'down' | 'left' | 'right';

/** Mode de difficulté (docs/01-game-design.md, section Difficulté). */
export type Difficulty = 'decouverte' | 'formation' | 'examen';

/** Priorité d'un ticket. */
export type TicketPriority = 'basse' | 'normale' | 'haute' | 'critique';

/** Résultat d'une mission terminée, transmis par `mission/completed`. */
export interface MissionResult {
  /** Nombre d'étapes réussies sans erreur ni indice. */
  readonly perfectSteps: number;
  /** Nombre total d'étapes de la mission. */
  readonly totalSteps: number;
  /** Erreurs comptées (mauvaise option, réponse refusée…). */
  readonly errors: number;
  /** Nombre de niveaux d'indice révélés. */
  readonly hintsUsed: number;
  /** Durée de la mission en millisecondes de temps réel. */
  readonly durationMs: number;
  /** XP gagnée au total (étapes, bonus et fin de mission). */
  readonly xpEarned: number;
  /** Note sur 20 pour les épreuves, absente sinon. */
  readonly grade?: number;
}

/** Identifiant d'un effet sonore ou d'une musique. */
export type SoundId =
  | 'ui-select'
  | 'ui-confirm'
  | 'ui-cancel'
  | 'dialogue-blip'
  | 'objective-done'
  | 'mission-success'
  | 'mission-error'
  | 'level-up'
  | 'door'
  | 'keyboard';
