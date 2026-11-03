import { success, type BashCommand } from '../command';

/** Commande `whoami` : affiche le compte courant. */
export const whoami: BashCommand = {
  name: 'whoami',
  summary: 'affiche le nom du compte courant',
  manual: `NOM
       whoami - afficher le nom de l'utilisateur effectif

SYNOPSIS
       whoami

DESCRIPTION
       Affiche le compte avec lequel les commandes s'exécutent. Avec sudo,
       c'est root.`,
  run: (_args, env) => success(`${env.user}\n`),
};
