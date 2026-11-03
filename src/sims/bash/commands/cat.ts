import { strerror } from '@sims/shared/errors';
import { readFile } from '@sims/shared/fs';
import type { BashCommand } from '../command';
import { parseOptions } from '../options';

/** Commande `cat` : affiche et concatène des fichiers. */
export const cat: BashCommand = {
  name: 'cat',
  summary: 'affiche le contenu de fichiers',
  manual: `NOM
       cat - concaténer des fichiers et les afficher

SYNOPSIS
       cat [OPTION]... [FICHIER]...

DESCRIPTION
       Affiche le contenu des fichiers les uns après les autres. Sans fichier,
       ou avec « - », lit l'entrée standard.

       -n     numéroter les lignes

EXEMPLES
       cat /etc/hostname           nom de la machine
       cat notes.txt | grep apache lignes qui parlent d'Apache`,
  run(args, env) {
    const parsed = parseOptions(args, { name: 'cat', short: 'n', long: { number: 'n' } });
    if (!parsed.ok) return { stderr: parsed.message, exitCode: 1 };
    const operands = parsed.operands.length ? parsed.operands : ['-'];
    let stdout = '';
    let stderr = '';
    for (const operand of operands) {
      if (operand === '-') {
        stdout += env.stdin;
        continue;
      }
      const read = readFile(env.machine, env.resolve(operand), env.user);
      if (read.ok) stdout += read.value;
      else stderr += `cat: ${operand}: ${strerror(read.error)}\n`;
    }
    if (parsed.flags.has('n') && stdout) {
      const lines = stdout.split('\n');
      const trailing = stdout.endsWith('\n') ? lines.pop() : undefined;
      stdout =
        lines.map((l, i) => `${String(i + 1).padStart(6)}\t${l}`).join('\n') +
        (trailing !== undefined ? '\n' : '');
    }
    return { stdout, stderr, exitCode: stderr ? 1 : 0 };
  },
};
