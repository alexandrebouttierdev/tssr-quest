import { statPath, setNode, writeFile } from '@sims/shared/fs';
import { canAccess } from '@sims/shared/permissions';
import type { BashCommand } from '../command';
import { parseOptions } from '../options';
import { fsError, missingOperand } from './helpers';

/** Commande `touch` : crée un fichier vide ou met à jour sa date. */
export const touch: BashCommand = {
  name: 'touch',
  summary: 'crée un fichier vide ou change sa date',
  manual: `NOM
       touch - changer la date d'un fichier, ou le créer vide

SYNOPSIS
       touch [-c] FICHIER...

DESCRIPTION
       Met la date de modification du fichier à maintenant. Si le fichier
       n'existe pas, il est créé vide.

       -c     ne pas créer le fichier s'il n'existe pas`,
  run(args, env) {
    const parsed = parseOptions(args, { name: 'touch', short: 'c', long: { 'no-create': 'c' } });
    if (!parsed.ok) return { stderr: parsed.message, exitCode: 1 };
    if (parsed.operands.length === 0)
      return { stderr: missingOperand('touch', 'opérande de fichier manquant'), exitCode: 1 };
    let machine = env.machine;
    let stderr = '';
    const now = env.ctx.now.getTime();
    for (const operand of parsed.operands) {
      const path = env.resolve(operand);
      const found = statPath(machine, path, env.user);
      if (found.ok) {
        const { node } = found.value;
        if (
          env.user !== 'root' &&
          node.owner !== env.user &&
          !canAccess(machine, env.user, node, 'write')
        ) {
          stderr += fsError('touch', 'impossible de faire un touch', operand, 'EACCES');
          continue;
        }
        machine = setNode(machine, found.value.path, { ...node, mtime: now });
        continue;
      }
      if (found.error !== 'ENOENT' || parsed.flags.has('c')) {
        if (found.error !== 'ENOENT')
          stderr += fsError('touch', 'impossible de faire un touch', operand, found.error);
        continue;
      }
      const created = writeFile(machine, path, env.user, '', { now });
      if (created.ok) machine = created.value;
      else stderr += fsError('touch', 'impossible de faire un touch', operand, created.error);
    }
    return { machine, stderr, exitCode: stderr ? 1 : 0 };
  },
};
