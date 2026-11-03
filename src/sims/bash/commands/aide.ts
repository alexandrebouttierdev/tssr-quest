import type { BashCommand } from '../command';

/** Commande propre au jeu : liste les commandes disponibles dans la simulation. */
export const aide: BashCommand = {
  name: 'aide',
  builtin: true,
  summary: 'liste les commandes disponibles dans cette simulation',
  manual: `NOM
       aide - lister les commandes de la simulation (propre à TSSR Quest)

SYNOPSIS
       aide

DESCRIPTION
       Affiche les commandes disponibles et un résumé de chacune. Pour le
       détail d'une commande, taper « man COMMANDE ». Utiliser l'aide n'est
       jamais pénalisé.`,
  run(_args, env) {
    const names = Object.keys(env.commands)
      .filter((n) => n !== '?' && n !== 'help')
      .sort();
    const width = Math.max(...names.map((n) => n.length));
    const lines = names.map((n) => `  ${n.padEnd(width)}  ${env.commands[n]?.summary ?? ''}`);
    return {
      exitCode: 0,
      stdout: `Commandes disponibles dans cette simulation :\n${lines.join('\n')}\n\nPour en savoir plus : man COMMANDE (par exemple « man ls »).\n`,
    };
  },
};
