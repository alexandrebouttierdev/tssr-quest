import { strerror } from '@sims/shared/errors';
import { removePath, statPath } from '@sims/shared/fs';
import type { Machine } from '@sims/shared/types';
import type { BashCommand } from '../command';
import { parseOptions } from '../options';

/** Commande `rm` : supprime des fichiers ou des dossiers. */
export const rm: BashCommand = {
  name: 'rm',
  summary: 'supprime des fichiers ou des dossiers',
  manual: `NOM
       rm - supprimer des fichiers ou des répertoires

SYNOPSIS
       rm [OPTION]... FICHIER...

DESCRIPTION
       Supprime les fichiers indiqués. Il n'y a pas de corbeille : un fichier
       supprimé l'est définitivement (seule une sauvegarde permet de le
       retrouver).

       -r, -R  supprimer les dossiers et tout leur contenu (récursif)
       -f      ne pas signaler les fichiers absents
       -d      supprimer un dossier vide
       -v      afficher ce qui est supprimé

       Supprimer un fichier demande le droit d'écriture sur le DOSSIER qui le
       contient. Dans un dossier avec le sticky bit (comme /tmp), seul le
       propriétaire du fichier peut le supprimer.

EXEMPLES
       rm vieux.log
       sudo rm /var/log/debug.log
       rm -r ancien-projet/`,
  run(args, env) {
    const parsed = parseOptions(args, {
      name: 'rm',
      short: 'rRfidv',
      long: { recursive: 'r', force: 'f', dir: 'd', verbose: 'v', interactive: 'i' },
    });
    if (!parsed.ok) return { stderr: parsed.message, exitCode: 1 };
    const { flags, operands } = parsed;
    const recursive = flags.has('r') || flags.has('R');
    const force = flags.has('f');
    if (operands.length === 0) {
      if (force) return { exitCode: 0 };
      return {
        stderr: "rm: opérande manquant\nSaisissez « rm --help » pour plus d'informations.\n",
        exitCode: 1,
      };
    }
    let machine: Machine = env.machine;
    let stdout = '';
    let stderr = '';
    for (const operand of operands) {
      const path = env.resolve(operand);
      if (path === '/' && recursive) {
        stderr +=
          "rm: il est dangereux d'opérer récursivement sur '/'\nrm: utilisez --no-preserve-root pour inhiber cette mesure de sécurité\n";
        continue;
      }
      const before = statPath(machine, path, env.user, { follow: false });
      const result = removePath(machine, path, env.user, {
        recursive,
        emptyDirOnly: flags.has('d') && !recursive,
      });
      if (!result.ok) {
        if (result.error === 'ENOENT' && force) continue;
        stderr += `rm: impossible de supprimer '${operand}': ${strerror(result.error)}\n`;
        continue;
      }
      machine = result.value;
      if (flags.has('v')) {
        const isDir = before.ok && before.value.node.type === 'dir';
        stdout += isDir ? `répertoire '${operand}' supprimé\n` : `'${operand}' supprimé\n`;
      }
    }
    return { machine, stdout, stderr, exitCode: stderr ? 1 : 0 };
  },
};
