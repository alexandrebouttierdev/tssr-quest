import type { ContentError } from './compile';
import type { Condition, ContentBundle, DialogueEffect, DialogueLine, Mission } from './schemas';

/**
 * Mots anglais courants qui trahissent un texte non traduit. Les termes techniques
 * (commande, service, sortie de commande) ne sont pas dans cette liste.
 */
const ENGLISH_WORDS = [
  'the',
  'and',
  'you',
  'your',
  'please',
  'click',
  'with',
  'this',
  'that',
  'is',
  'are',
  'was',
  'were',
  'what',
  'which',
  'when',
  'where',
  'there',
  'their',
  'have',
  'has',
  'should',
  'would',
  'could',
  'yes',
  'no',
  'not',
  'from',
  'into',
  'about',
  'next',
  'back',
  'cancel',
  'continue',
  'hello',
  'thanks',
  'welcome',
  'done',
  'failed',
  'success',
  'error',
  'warning',
];

/** Termes techniques autorisés même s'ils ressemblent à de l'anglais. */
const TECHNICAL_WHITELIST = new Set(['no space left on device', 'failed', 'error']);

/** Extrait les morceaux de texte destinés au joueur, hors code entre accents graves et « guillemets » de commandes. */
function prose(text: string): string {
  return text
    .replace(/`[^`]*`/g, ' ')
    .replace(/(?:^|\s)(?:sudo\s+)?[a-z][\w.-]*(?:\s+-{1,2}[\w=-]+)+/g, ' ')
    .replace(/\/[\w./-]+/g, ' ');
}

/**
 * Cherche des mots anglais dans un texte destiné au joueur.
 *
 * @param text - Texte à vérifier.
 * @returns Les mots anglais trouvés.
 */
export function englishWords(text: string): string[] {
  const lowered = prose(text).toLowerCase();
  if (TECHNICAL_WHITELIST.has(lowered.trim())) return [];
  const words = lowered.match(/[a-z']+/g) ?? [];
  const found = new Set(words.filter((w) => ENGLISH_WORDS.includes(w)));
  // « no », « is » … isolés sont rares en français : il en faut deux distincts pour signaler.
  return found.size >= 2 ? [...found].sort() : [];
}

/** XP maximale d'une mission : XP des étapes, bonus sans faute et XP de fin. */
export function missionMaxXp(mission: Mission): number {
  const steps = mission.steps.reduce((sum, s) => sum + (s.xp ?? 20) + 10, 0);
  return steps + (mission.rewards.xp ?? 50);
}

/** Toutes les répliques d'un nœud, branches de choix comprises. */
function* walkLines(lines: readonly DialogueLine[]): Generator<DialogueLine> {
  for (const line of lines) {
    yield line;
    for (const choice of line.choices ?? []) yield* walkLines(choice.then ?? []);
  }
}

/** Tous les effets d'un nœud (répliques et choix). */
function* walkEffects(lines: readonly DialogueLine[]): Generator<DialogueEffect> {
  for (const line of walkLines(lines)) {
    yield* line.effects ?? [];
    for (const choice of line.choices ?? []) yield* choice.effects ?? [];
  }
}

/** Machines visées par une condition (pour vérifier qu'elles existent). */
function conditionMachines(condition: Condition): string[] {
  if ('all' in condition) return condition.all.flatMap(conditionMachines);
  if ('any' in condition) return condition.any.flatMap(conditionMachines);
  if ('not' in condition) return conditionMachines(condition.not);
  const inner = Object.values(condition)[0] as { machine?: string };
  return inner.machine ? [inner.machine] : [];
}

/**
 * Vérifie la cohérence globale du contenu (docs/04, « Validation du contenu ») :
 * références croisées, prérequis sans cycle, textes en français, XP raisonnable.
 *
 * @param bundle - Contenu compilé.
 * @returns Les erreurs trouvées (vide si tout est cohérent).
 */
export function validateBundle(bundle: ContentBundle): ContentError[] {
  const errors: ContentError[] = [];
  const npcs = new Set(bundle.npcs.map((n) => n.id));
  const zones = new Set(bundle.zones.map((z) => z.id));
  const items = new Set(bundle.items.map((i) => i.id));
  const sheets = new Set(bundle.sheets.map((s) => s.id));
  const missions = new Map(bundle.missions.map((m) => [m.id, m]));
  const chapters = new Map(bundle.chapters.map((c) => [c.id, c]));
  const nodes = new Map(bundle.dialogues.map((d) => [d.npc, new Set(Object.keys(d.nodes))]));
  const check = (file: string, ok: boolean, message: string) => {
    if (!ok) errors.push({ file, message });
  };
  const checkRef = (file: string, ref: string) => {
    const [npc = '', node = ''] = ref.split('#');
    check(file, nodes.get(npc)?.has(node) === true, `nœud de dialogue introuvable : ${ref}`);
  };
  const checkEffects = (file: string, effects: Iterable<DialogueEffect>) => {
    for (const effect of effects) {
      if ('giveItem' in effect)
        check(file, items.has(effect.giveItem), `objet inconnu : ${effect.giveItem}`);
      if ('takeItem' in effect)
        check(file, items.has(effect.takeItem), `objet inconnu : ${effect.takeItem}`);
      if ('startMission' in effect)
        check(file, missions.has(effect.startMission), `mission inconnue : ${effect.startMission}`);
      if ('unlockSheet' in effect)
        check(file, sheets.has(effect.unlockSheet), `fiche inconnue : ${effect.unlockSheet}`);
      if ('unlockZone' in effect)
        check(file, zones.has(effect.unlockZone), `zone inconnue : ${effect.unlockZone}`);
    }
  };
  const checkText = (file: string, text: string | undefined) => {
    if (!text) return;
    const words = englishWords(text);
    check(file, words.length === 0, `texte en anglais ? (${words.join(', ')}) : « ${text} »`);
  };

  for (const npc of bundle.npcs)
    check(`npcs/${npc.id}.npc.yaml`, zones.has(npc.zone), `zone inconnue : ${npc.zone}`);
  for (const dialogue of bundle.dialogues) {
    const file = `dialogues/${dialogue.npc}.dialogue.yaml`;
    check(file, npcs.has(dialogue.npc), `PNJ inconnu : ${dialogue.npc}`);
    for (const lines of Object.values(dialogue.nodes)) {
      checkEffects(file, walkEffects(lines));
      for (const line of walkLines(lines)) {
        checkText(file, line.say);
        for (const choice of line.choices ?? []) checkText(file, choice.text);
        if (line.if && 'missionDone' in line.if)
          check(
            file,
            missions.has(line.if.missionDone),
            `mission inconnue : ${line.if.missionDone}`,
          );
      }
    }
  }
  for (const chapter of bundle.chapters) {
    const file = `chapters/${chapter.id}/chapter.yaml`;
    check(file, npcs.has(chapter.mentor), `mentor inconnu : ${chapter.mentor}`);
    for (const zone of [...chapter.zones, ...(chapter.unlocks?.zones ?? [])])
      check(file, zones.has(zone), `zone inconnue : ${zone}`);
    for (const item of chapter.unlocks?.items ?? [])
      check(file, items.has(item), `objet inconnu : ${item}`);
    for (const id of [...chapter.missions, ...(chapter.exam ? [chapter.exam] : [])])
      check(file, missions.has(id), `mission inconnue : ${id}`);
  }
  for (const mission of bundle.missions) {
    const file = `missions/${mission.id}`;
    const chapter = chapters.get(mission.chapter);
    check(file, chapter !== undefined, `chapitre inconnu : ${mission.chapter}`);
    check(
      file,
      chapter === undefined || chapter.missions.includes(mission.id) || chapter.exam === mission.id,
      `mission absente de la liste du chapitre ${mission.chapter}`,
    );
    check(file, npcs.has(mission.giver), `PNJ inconnu : ${mission.giver}`);
    check(file, zones.has(mission.zone), `zone inconnue : ${mission.zone}`);
    if (mission.ticket)
      check(
        file,
        npcs.has(mission.ticket.requester),
        `demandeur inconnu : ${mission.ticket.requester}`,
      );
    for (const id of mission.requires?.missions ?? [])
      check(file, missions.has(id), `prérequis inconnu : ${id}`);
    for (const id of mission.requires?.items ?? [])
      check(file, items.has(id), `objet requis inconnu : ${id}`);
    for (const id of mission.rewards.items ?? [])
      check(file, items.has(id), `objet inconnu : ${id}`);
    for (const id of mission.rewards.sheets ?? [])
      check(file, sheets.has(id), `fiche inconnue : ${id}`);
    checkRef(file, mission.dialogue.intro);
    checkRef(file, mission.dialogue.outro);
    if (mission.dialogue.abandon) checkRef(file, mission.dialogue.abandon);
    checkText(file, mission.title);
    checkText(file, mission.summary);
    mission.recap.forEach((r) => checkText(file, r));
    for (const step of mission.steps) {
      if (step.sheet) check(file, sheets.has(step.sheet), `fiche inconnue : ${step.sheet}`);
      step.hints?.forEach((h) => checkText(file, h));
      if (step.type === 'dialogue') checkRef(file, step.node);
      if (step.type === 'choice') {
        checkText(file, step.question);
        step.options.forEach((o) => checkText(file, o.text));
      }
      if (step.type === 'terminal') {
        checkText(file, step.goal);
        for (const objective of step.objectives) {
          checkText(file, objective.label);
          for (const machine of conditionMachines(objective.when)) {
            check(file, mission.machines?.[machine] !== undefined, `machine inconnue : ${machine}`);
          }
        }
      }
    }
    const xp = missionMaxXp(mission);
    check(file, xp >= 60 && xp <= 600, `XP maximale hors fourchette (60 à 600) : ${xp}`);
  }

  // Prérequis : pas de cycle (parcours en profondeur avec trois couleurs).
  const state = new Map<string, 'en-cours' | 'fini'>();
  const visit = (id: string, path: string[]): void => {
    if (state.get(id) === 'fini') return;
    if (state.get(id) === 'en-cours') {
      errors.push({
        file: `missions/${id}`,
        message: `cycle de prérequis : ${[...path, id].join(' → ')}`,
      });
      return;
    }
    state.set(id, 'en-cours');
    for (const next of missions.get(id)?.requires?.missions ?? []) visit(next, [...path, id]);
    state.set(id, 'fini');
  };
  for (const id of missions.keys()) visit(id, []);
  return errors;
}
