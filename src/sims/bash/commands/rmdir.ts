import { removePath, statPath } from '@sims/shared/fs';
import { dirname } from '@sims/shared/path';
import type { BashCommand } from '../command';
import { parseOptions } from '../options';
import { fsError, missingOperand } from './helpers';

/** Commande `rmdir` : supprime des répertoires vides. */
export const rmdir: BashCommand = {
  name: 'rmdir',
  summary: 'supprime des répertoires vides',
  manual: `NOM
       rmdir - supprimer des répertoires vides

SYNOPSIS
       rmdir [-p] RÉPERTOIRE...

DESCRIPTION
       Supprime les répertoires s'ils sont vides. Pour un répertoire non vide,
       utiliser rm -r (avec prudence).

       -p     supprimer aussi les parents devenus vides (rmdir -p a/b/c)`,
  run(args, env) {
    const parsed = parseOptions(args, {
      name: 'rmdir',
      short: 'pv',
      long: { parents: 'p', verbose: 'v' },
    });
    if (!parsed.ok) return { stderr: parsed.message, exitCode: 1 };
    if (parsed.operands.length === 0) return { stderr: missingOperand('rmdir'), exitCode: 1 };
    let machine = env.machine;
    let stderr = '';
    for (const operand of parsed.operands) {
      let shown = operand;
      let path = env.resolve(operand);
      for (;;) {
        const found = statPath(machine, path, env.user, { follow: false });
        const result =
          found.ok && found.value.node.type !== 'dir'
            ? ({ ok: false, error: 'ENOTDIR' } as const)
            : removePath(machine, path, env.user, { emptyDirOnly: true });
        if (!result.ok) {
          stderr += fsError('rmdir', 'impossible de supprimer', shown, result.error);
          break;
        }
        machine = result.value;
        if (!parsed.flags.has('p') || !shown.includes('/')) break;
        shown = shown.slice(0, shown.lastIndexOf('/'));
        path = dirname(path);
        if (!shown) break;
      }
    }
    return { machine, stderr, exitCode: stderr ? 1 : 0 };
  },
};
