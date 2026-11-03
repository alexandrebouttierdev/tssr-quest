import type { ContentIndex } from '@content/loader';
import type { Mission } from '@content/schemas';
import type { DialogueWorld } from './dialogue-runner';

/** État de la partie utile au choix du dialogue d'un PNJ. */
export interface NpcDialogueWorld extends DialogueWorld {
  /** Missions dont l'outro a déjà été jouée. */
  readonly debriefed: readonly string[];
  /** Mission en cours, le cas échéant. */
  readonly activeMission: string | null;
}

/** Nœud à jouer quand le joueur parle à un PNJ. */
export interface NodeSelection {
  readonly nodeId: string;
  readonly kind: 'intro' | 'outro' | 'default';
  readonly missionId?: string;
}

/**
 * Indique si les prérequis d'une mission sont remplis.
 *
 * @param mission - Mission du contenu.
 * @param world - État de la partie.
 * @returns Vrai si la mission peut être proposée.
 */
export function missionAvailable(mission: Mission, world: NpcDialogueWorld): boolean {
  const req = mission.requires;
  if (world.completedMissions.includes(mission.id) || world.activeMission === mission.id)
    return false;
  return (
    (req?.missions ?? []).every((m) => world.completedMissions.includes(m)) &&
    (req?.flags ?? []).every((f) => world.flags[f] === true) &&
    (req?.items ?? []).every((i) => world.items.includes(i)) &&
    world.level >= (req?.level ?? 1)
  );
}

/**
 * Choisit le dialogue d'un PNJ, par priorité (docs/04) : intro d'une mission disponible,
 * outro d'une mission terminée non débriefée, puis réplique par défaut.
 *
 * @param npcId - PNJ à qui l'on parle.
 * @param content - Contenu indexé.
 * @param world - État de la partie.
 * @returns Le nœud à jouer.
 */
export function selectNode(
  npcId: string,
  content: ContentIndex,
  world: NpcDialogueWorld,
): NodeSelection {
  const ownMissions = [...content.missions.values()].filter((m) => m.giver === npcId);
  const split = (ref: string) => ref.split('#')[1] ?? 'default';
  if (world.activeMission === null) {
    const available = ownMissions.find((m) => missionAvailable(m, world));
    if (available)
      return { nodeId: split(available.dialogue.intro), kind: 'intro', missionId: available.id };
  }
  const toDebrief = ownMissions.find(
    (m) => world.completedMissions.includes(m.id) && !world.debriefed.includes(m.id),
  );
  if (toDebrief)
    return { nodeId: split(toDebrief.dialogue.outro), kind: 'outro', missionId: toDebrief.id };
  return { nodeId: 'default', kind: 'default' };
}
