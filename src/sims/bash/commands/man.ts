import { failure, type BashCommand } from '../command';

/** Largeur des pages de manuel. */
const WIDTH = 78;

/**
 * Met en page un manuel avec l'en-tête des pages `man`.
 *
 * @param name - Nom de la commande.
 * @param body - Corps de la page (sections NOM, SYNOPSIS…).
 * @returns La page complète.
 */
export function renderManPage(name: string, body: string): string {
  const tag = `${name.toUpperCase()}(1)`;
  const title = 'Page simplifiée TSSR Quest';
  const gap = WIDTH - tag.length * 2 - title.length;
  const left = Math.max(1, Math.floor(gap / 2));
  const header = tag + ' '.repeat(left) + title + ' '.repeat(Math.max(1, gap - left)) + tag;
  return `${header}\n\n${body}\n\n${'TSSR Quest'.padEnd(WIDTH - tag.length)}${tag}\n`;
}

/** Commande `man` : affiche la page de manuel (simplifiée, en français) d'une commande. */
export const man: BashCommand = {
  name: 'man',
  summary: "affiche le manuel d'une commande",
  manual: `NOM
       man - afficher le manuel d'une commande

SYNOPSIS
       man COMMANDE

DESCRIPTION
       Affiche la page de manuel de COMMANDE. Dans TSSR Quest, les pages sont
       simplifiées et traduites en français ; sur un vrai serveur, elles sont
       plus longues et souvent en anglais.

EXEMPLES
       man ls       tout savoir sur ls`,
  run(args, env) {
    const name = args.find((a) => !a.startsWith('-'));
    if (name === undefined) {
      return failure('Quelle page de manuel voulez-vous ?\nPar exemple, essayez « man man ».');
    }
    const command = Object.hasOwn(env.commands, name) ? env.commands[name] : undefined;
    if (!command) return failure(`Il n'y a pas de page de manuel pour ${name}.`, 16);
    return { exitCode: 0, stdout: renderManPage(name, command.manual) };
  },
};
