import type {
  DialogueCondition,
  DialogueEffect,
  DialogueFile,
  DialogueLine,
} from '@content/schemas';

/** Ce que les conditions de dialogue peuvent lire de la partie. */
export interface DialogueWorld {
  readonly flags: Readonly<Record<string, true>>;
  readonly completedMissions: readonly string[];
  readonly items: readonly string[];
  readonly level: number;
}

/** Position dans un dialogue : pile des listes de répliques en cours (les choix empilent leur suite). */
export interface DialogueCursor {
  readonly npcId: string;
  readonly nodeId: string;
  readonly frames: readonly { readonly lines: readonly DialogueLine[]; readonly index: number }[];
  /** Drapeaux posés pendant ce dialogue (pris en compte par les `if` suivants). */
  readonly flags: Readonly<Record<string, true>>;
}

/** Résultat d'un pas de dialogue. */
export interface DialogueStep {
  /** Position atteinte ; `null` quand le dialogue est terminé. */
  readonly cursor: DialogueCursor | null;
  /** Réplique à afficher (avec du texte) ; `null` à la fin. */
  readonly line: DialogueLine | null;
  /** Effets déclenchés pendant ce pas, dans l'ordre. */
  readonly effects: readonly DialogueEffect[];
}

/**
 * Évalue une condition de réplique.
 *
 * @param condition - Condition `if` du YAML.
 * @param world - État de la partie.
 * @param flags - Drapeaux à jour (partie + dialogue en cours).
 * @returns Vrai si la réplique doit être jouée.
 */
export function dialogueConditionMet(
  condition: DialogueCondition,
  world: DialogueWorld,
  flags: Readonly<Record<string, true>>,
): boolean {
  if ('flag' in condition) return flags[condition.flag] === true;
  if ('notFlag' in condition) return flags[condition.notFlag] !== true;
  if ('missionDone' in condition) return world.completedMissions.includes(condition.missionDone);
  if ('hasItem' in condition) return world.items.includes(condition.hasItem);
  return world.level >= condition.level;
}

/** Applique les effets de drapeaux à une copie locale. */
function applyFlags(
  flags: Readonly<Record<string, true>>,
  effects: readonly DialogueEffect[],
): Record<string, true> {
  const next: Record<string, true> = { ...flags };
  for (const effect of effects) {
    if ('flag' in effect) next[effect.flag] = true;
    if ('unflag' in effect) delete next[effect.unflag];
  }
  return next;
}

/** Avance jusqu'à la prochaine réplique affichable, en jouant les effets rencontrés. */
function settle(
  cursor: DialogueCursor,
  world: DialogueWorld,
  pending: DialogueEffect[],
): DialogueStep {
  const frames = cursor.frames.map((f) => ({ ...f }));
  let flags = cursor.flags;
  const effects = [...pending];
  while (frames.length > 0) {
    const frame = frames[frames.length - 1];
    if (!frame) break;
    const line = frame.lines[frame.index];
    if (!line) {
      frames.pop();
      continue;
    }
    if (line.if && !dialogueConditionMet(line.if, world, flags)) {
      frame.index++;
      continue;
    }
    effects.push(...(line.effects ?? []));
    flags = applyFlags(flags, line.effects ?? []);
    if (line.say !== undefined) {
      return { cursor: { ...cursor, frames, flags }, line, effects };
    }
    frame.index++;
  }
  return { cursor: null, line: null, effects };
}

/** Réplique courante d'une position. */
function currentLine(cursor: DialogueCursor): DialogueLine | undefined {
  const frame = cursor.frames[cursor.frames.length - 1];
  return frame?.lines[frame.index];
}

/** Position avancée d'une réplique dans la liste du sommet de pile. */
function stepForward(cursor: DialogueCursor): DialogueCursor['frames'] {
  return cursor.frames.map((f, i) =>
    i === cursor.frames.length - 1 ? { ...f, index: f.index + 1 } : f,
  );
}

/**
 * Démarre un nœud de dialogue.
 *
 * @param file - Dialogues du PNJ.
 * @param nodeId - Nœud à jouer.
 * @param world - État de la partie.
 * @returns La première réplique et les effets rencontrés.
 * @throws {Error} Si le nœud n'existe pas.
 */
export function startDialogue(
  file: DialogueFile,
  nodeId: string,
  world: DialogueWorld,
): DialogueStep {
  const lines = file.nodes[nodeId];
  if (!lines) throw new Error(`Nœud de dialogue introuvable : ${file.npc}#${nodeId}`);
  return settle(
    { npcId: file.npc, nodeId, frames: [{ lines, index: 0 }], flags: world.flags },
    world,
    [],
  );
}

/**
 * Passe à la réplique suivante (sans effet si la réplique attend un choix).
 *
 * @param cursor - Position actuelle.
 * @param world - État de la partie.
 * @returns La réplique suivante, ou la fin du dialogue.
 */
export function advanceDialogue(cursor: DialogueCursor, world: DialogueWorld): DialogueStep {
  const line = currentLine(cursor);
  if (line?.choices) return { cursor, line, effects: [] };
  return settle({ ...cursor, frames: stepForward(cursor) }, world, []);
}

/**
 * Applique le choix du joueur, puis joue sa suite (`then`) avant de reprendre le nœud.
 *
 * @param cursor - Position actuelle (sur une réplique à choix).
 * @param choiceIndex - Indice du choix.
 * @param world - État de la partie.
 * @returns La réplique suivante et les effets du choix.
 */
export function chooseDialogue(
  cursor: DialogueCursor,
  choiceIndex: number,
  world: DialogueWorld,
): DialogueStep {
  const line = currentLine(cursor);
  const choice = line?.choices?.[choiceIndex];
  if (!choice) return { cursor, line: line ?? null, effects: [] };
  const effects = choice.effects ?? [];
  const frames = [...stepForward(cursor), { lines: choice.then ?? [], index: 0 }];
  return settle({ ...cursor, frames, flags: applyFlags(cursor.flags, effects) }, world, [
    ...effects,
  ]);
}
