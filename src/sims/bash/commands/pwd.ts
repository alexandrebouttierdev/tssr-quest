import { success, type BashCommand } from '../command';

/** Commande `pwd` : affiche le répertoire courant. */
export const pwd: BashCommand = {
  name: 'pwd',
  summary: 'affiche le répertoire courant',
  manual: `NOM
       pwd - afficher le nom du répertoire courant

SYNOPSIS
       pwd

DESCRIPTION
       Affiche le chemin absolu du répertoire dans lequel on se trouve.
       Utile pour se repérer avant d'utiliser des chemins relatifs.`,
  run(_args, env) {
    return success(`${env.cwd}\n`);
  },
};
