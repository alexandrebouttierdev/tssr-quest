import { canAccess } from '@sims/shared/permissions';
import { dirname } from '@sims/shared/path';
import type { BashCommand } from '../command';
import { globToRegExp, hasGlob } from '../glob';

/** Commande `locate` : cherche dans la base de noms (mise à jour par updatedb). */
export const locate: BashCommand = {
  name: 'locate',
  summary: 'trouve des fichiers par leur nom (base updatedb)',
  manual: `NOM
       locate - trouver des fichiers par leur nom

SYNOPSIS
       locate [-i] MOTIF

DESCRIPTION
       Cherche MOTIF dans une base de noms de fichiers, très rapidement. La
       base est mise à jour chaque nuit (ou à la main : sudo updatedb) : un
       fichier créé depuis n'est pas encore trouvé. find, lui, parcourt le
       disque en direct.

       -i     ignorer la casse`,
  run(args, env) {
    const pattern = args.find((a) => !a.startsWith('-'));
    if (!pattern) return { stderr: 'locate: pas de motif à rechercher indiqué\n', exitCode: 1 };
    const ci = args.includes('-i');
    const since = env.machine.locateDbTime ?? env.machine.bootTime;
    const matches = hasGlob(pattern)
      ? (path: string) => globToRegExp(pattern).test(path.split('/').pop() ?? '')
      : (path: string) =>
          ci ? path.toLowerCase().includes(pattern.toLowerCase()) : path.includes(pattern);
    const hits = Object.entries(env.machine.fs)
      .filter(([path, node]) => path !== '/' && node.mtime <= since && matches(path))
      .filter(([path]) => {
        // locate ne montre que les chemins dont le dossier parent est lisible par le compte.
        const parent = env.machine.fs[dirname(path)];
        return parent !== undefined && canAccess(env.machine, env.user, parent, 'read');
      })
      .map(([path]) => path)
      .sort();
    return { stdout: hits.map((h) => `${h}\n`).join(''), exitCode: hits.length ? 0 : 1, ok: true };
  },
};

/** Commande `updatedb` : met à jour la base de locate (root). */
export const updatedb: BashCommand = {
  name: 'updatedb',
  summary: 'met à jour la base de locate',
  manual: `NOM
       updatedb - mettre à jour la base de noms de locate

SYNOPSIS
       sudo updatedb`,
  run(_args, env) {
    if (env.user !== 'root')
      return {
        stderr:
          "updatedb: impossible d'ouvrir un fichier temporaire pour « /var/lib/plocate/plocate.db »\n",
        exitCode: 1,
      };
    return { exitCode: 0, machine: { ...env.machine, locateDbTime: env.ctx.now.getTime() } };
  },
};
