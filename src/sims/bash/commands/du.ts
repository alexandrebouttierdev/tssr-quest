import { strerror } from '@sims/shared/errors';
import { childrenOf, fileSize, statPath } from '@sims/shared/fs';
import { canAccess } from '@sims/shared/permissions';
import { formatHumanSize } from '@sims/shared/size';
import type { FsNode } from '@sims/shared/types';
import type { BashCommand, CommandEnv } from '../command';
import { parseOptions } from '../options';

/** Octets alloués à un nœud (blocs de 4 Kio). */
function allocated(node: FsNode): number {
  if (node.type === 'symlink') return 0;
  return Math.ceil(fileSize(node) / 4096) * 4096;
}

/** Commande `du` : espace occupé par des fichiers et dossiers. */
export const du: BashCommand = {
  name: 'du',
  summary: "estime l'espace occupé par des fichiers",
  manual: `NOM
       du - estimer l'espace disque occupé par des fichiers

SYNOPSIS
       du [OPTION]... [FICHIER]...

DESCRIPTION
       Affiche l'espace occupé par chaque dossier (et ses sous-dossiers).

       -s     n'afficher que le total de chaque argument
       -h     tailles lisibles (K, M, G)
       -a     afficher aussi les fichiers, pas seulement les dossiers
       -c     afficher un total général

EXEMPLES
       du -sh /var/log          taille totale des journaux
       du -h /var | sort -h     trouver les plus gros dossiers`,
  run(args, env) {
    const parsed = parseOptions(args, {
      name: 'du',
      short: 'shac',
      long: { summarize: 's', 'human-readable': 'h', all: 'a', total: 'c' },
    });
    if (!parsed.ok) return { stderr: parsed.message, exitCode: 1 };
    const { flags } = parsed;
    const show = (bytes: number) =>
      flags.has('h') ? formatHumanSize(bytes) : String(Math.ceil(bytes / 1024));
    const lines: string[] = [];
    let stderr = '';
    let grandTotal = 0;

    const walk = (
      path: string,
      shown: string,
      node: FsNode,
      top: boolean,
      envRef: CommandEnv,
    ): number => {
      let total = allocated(node);
      if (node.type === 'dir') {
        const readable =
          canAccess(envRef.machine, envRef.user, node, 'read') &&
          canAccess(envRef.machine, envRef.user, node, 'exec');
        if (!readable) {
          stderr += `du: impossible de lire le répertoire '${shown}': ${strerror('EACCES')}\n`;
        } else {
          for (const child of childrenOf(envRef.machine.fs, path)) {
            const childShown = shown.endsWith('/') ? shown + child.name : `${shown}/${child.name}`;
            total += walk(child.path, childShown, child.node, false, envRef);
          }
        }
      }
      const listed = top || (!flags.has('s') && (node.type === 'dir' || flags.has('a')));
      if (listed) lines.push(`${show(total)}\t${shown}`);
      return total;
    };

    for (const operand of parsed.operands.length ? parsed.operands : ['.']) {
      const found = statPath(env.machine, env.resolve(operand), env.user);
      if (!found.ok) {
        stderr += `du: impossible d'accéder à '${operand}': ${strerror(found.error)}\n`;
        continue;
      }
      grandTotal += walk(found.value.path, operand, found.value.node, true, env);
    }
    if (flags.has('c')) lines.push(`${show(grandTotal)}\ttotal`);
    return {
      stdout: lines.length ? `${lines.join('\n')}\n` : '',
      stderr,
      exitCode: stderr ? 1 : 0,
    };
  },
};
