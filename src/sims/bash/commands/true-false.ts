import type { BashCommand } from '../command';

/** Commande `true` : ne fait rien et réussit. */
export const trueCommand: BashCommand = {
  name: 'true',
  summary: 'ne fait rien, avec succès',
  manual: `NOM
       true - ne rien faire, avec succès

SYNOPSIS
       true

DESCRIPTION
       Renvoie toujours le code 0. Utile dans les tests et les boucles.`,
  run: () => ({ exitCode: 0 }),
};

/** Commande `false` : ne fait rien et échoue. */
export const falseCommand: BashCommand = {
  name: 'false',
  summary: 'ne fait rien, en échec',
  manual: `NOM
       false - ne rien faire, en échec

SYNOPSIS
       false

DESCRIPTION
       Renvoie toujours le code 1. Utile pour tester && et ||.`,
  run: () => ({ exitCode: 1, ok: true }),
};
