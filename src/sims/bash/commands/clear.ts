import type { BashCommand } from '../command';

/** Commande `clear` : efface l'écran du terminal. */
export const clear: BashCommand = {
  name: 'clear',
  summary: "efface l'écran du terminal",
  manual: `NOM
       clear - effacer l'écran du terminal

SYNOPSIS
       clear

DESCRIPTION
       Efface l'écran. Le raccourci Ctrl+L fait la même chose.`,
  run: () => ({ exitCode: 0, effects: [{ type: 'clear' }] }),
};
