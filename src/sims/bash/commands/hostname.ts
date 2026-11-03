import { success, type BashCommand } from '../command';

/** Commande `hostname` : affiche le nom (ou les adresses) de la machine. */
export const hostname: BashCommand = {
  name: 'hostname',
  summary: 'affiche le nom de la machine',
  manual: `NOM
       hostname - afficher le nom de la machine

SYNOPSIS
       hostname [-I]

DESCRIPTION
       Affiche le nom de la machine.

       -I     afficher toutes les adresses IP de la machine (hors 127.0.0.1)`,
  run(args, env) {
    if (args.includes('-I')) {
      const ips = env.machine.interfaces
        .filter((i) => i.up && i.ipv4 && i.name !== 'lo')
        .map((i) => (i.ipv4 ?? '').split('/')[0]);
      return success(`${ips.join(' ')} \n`);
    }
    return success(`${env.machine.hostname}\n`);
  },
};
