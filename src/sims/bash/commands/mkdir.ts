import { strerror } from '@sims/shared/errors';
import { makeDir, setNode } from '@sims/shared/fs';
import type { BashCommand } from '../command';
import { parseOptions } from '../options';
import { missingOperand } from './helpers';

/** Commande `mkdir` : crée des répertoires. */
export const mkdir: BashCommand = {
  name: 'mkdir',
  summary: 'crée des répertoires',
  manual: `NOM
       mkdir - créer des répertoires

SYNOPSIS
       mkdir [OPTION]... RÉPERTOIRE...

DESCRIPTION
       Crée les répertoires indiqués (droits 755 avec le umask par défaut 022).

       -p     créer aussi les répertoires parents, sans erreur s'ils existent
       -m MODE  donner directement ce mode octal (ex. -m 750)
       -v     afficher chaque répertoire créé

EXEMPLES
       mkdir projets
       mkdir -p /srv/partage/compta/2026`,
  run(args, env) {
    const parsed = parseOptions(args, {
      name: 'mkdir',
      short: 'pv',
      withValue: 'm',
      long: { parents: 'p', verbose: 'v', mode: 'm' },
    });
    if (!parsed.ok) return { stderr: parsed.message, exitCode: 1 };
    if (parsed.operands.length === 0) return { stderr: missingOperand('mkdir'), exitCode: 1 };
    const modeText = parsed.values.get('m');
    if (modeText !== undefined && !/^[0-7]{1,4}$/.test(modeText))
      return { stderr: `mkdir: mode non valable « ${modeText} »\n`, exitCode: 1 };
    let machine = env.machine;
    let stdout = '';
    let stderr = '';
    const now = env.ctx.now.getTime();
    for (const operand of parsed.operands) {
      const path = env.resolve(operand);
      const existed = machine.fs[path] !== undefined;
      const result = makeDir(machine, path, env.user, { parents: parsed.flags.has('p'), now });
      if (!result.ok) {
        stderr += `mkdir: impossible de créer le répertoire « ${operand} »: ${strerror(result.error)}\n`;
        continue;
      }
      machine = result.value;
      const node = machine.fs[path];
      if (modeText !== undefined && node && !existed)
        machine = setNode(machine, path, { ...node, mode: parseInt(modeText, 8) });
      if (parsed.flags.has('v') && !existed)
        stdout += `mkdir: création du répertoire '${operand}'\n`;
    }
    return { machine, stdout, stderr, exitCode: stderr ? 1 : 0 };
  },
};
