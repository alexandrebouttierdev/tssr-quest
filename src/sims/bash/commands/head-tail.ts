import type { BashCommand, CommandEnv, CommandOutcome } from '../command';
import { readInputs, splitLines, joinLines } from './helpers';

/** Lit l'option -n (ou la forme courte historique -5). */
function lineCount(args: readonly string[]): {
  count: number;
  fromStart: boolean;
  rest: string[];
  error?: string;
  follow: boolean;
} {
  let count = 10;
  let fromStart = false;
  let follow = false;
  const rest: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    let value: string | undefined;
    if (arg === '-n' || arg === '--lines') value = args[++i];
    else if (arg.startsWith('-n')) value = arg.slice(2);
    else if (arg.startsWith('--lines=')) value = arg.slice(8);
    else if (/^-\d+$/.test(arg)) value = arg.slice(1);
    else if (arg === '-f' || arg === '-F' || arg === '--follow') {
      follow = true;
      continue;
    } else if (arg === '-q' || arg === '-v') {
      rest.push(arg);
      continue;
    } else {
      rest.push(arg);
      continue;
    }
    if (value === undefined || !/^[+-]?\d+$/.test(value)) {
      return {
        count,
        fromStart,
        rest,
        follow,
        error: `nombre de lignes incorrect : « ${value ?? ''} »`,
      };
    }
    fromStart = value.startsWith('+');
    count = Math.abs(Number(value));
  }
  return { count, fromStart, rest, follow };
}

/** Partie commune de head et tail. */
function headTail(name: 'head' | 'tail', args: readonly string[], env: CommandEnv): CommandOutcome {
  const parsed = lineCount(args);
  if (parsed.error) return { stderr: `${name}: ${parsed.error}\n`, exitCode: 1 };
  const quiet = parsed.rest.includes('-q');
  const operands = parsed.rest.filter((a) => a !== '-q' && a !== '-v');
  const { inputs, stderr } = readInputs(env, operands, name);
  const showHeaders = (inputs.length > 1 || parsed.rest.includes('-v')) && !quiet;
  const blocks = inputs.map((input) => {
    const lines = splitLines(input.content);
    let selected: string[];
    if (name === 'head') selected = lines.slice(0, parsed.count);
    else if (parsed.fromStart) selected = lines.slice(Math.max(0, parsed.count - 1));
    else selected = parsed.count === 0 ? [] : lines.slice(-parsed.count);
    const header = showHeaders
      ? `==> ${input.name === '-' ? 'entrée standard' : input.name} <==\n`
      : '';
    return header + joinLines(selected);
  });
  return { stdout: blocks.join(showHeaders ? '\n' : ''), stderr, exitCode: stderr ? 1 : 0 };
}

/** Commande `head` : premières lignes d'un fichier. */
export const head: BashCommand = {
  name: 'head',
  summary: "affiche le début d'un fichier",
  manual: `NOM
       head - afficher le début d'un fichier

SYNOPSIS
       head [-n N] [FICHIER]...

DESCRIPTION
       Affiche les 10 premières lignes (ou N avec -n).

EXEMPLES
       head -n 3 /etc/passwd
       ls -lS /var/log | head -n 5     les 5 plus gros fichiers`,
  run: (args, env) => headTail('head', args, env),
};

/** Commande `tail` : dernières lignes d'un fichier. */
export const tail: BashCommand = {
  name: 'tail',
  summary: "affiche la fin d'un fichier",
  manual: `NOM
       tail - afficher la fin d'un fichier

SYNOPSIS
       tail [-n N] [-f] [FICHIER]...

DESCRIPTION
       Affiche les 10 dernières lignes (ou N avec -n ; -n +K commence à la
       ligne K).

       -f     suivre le fichier : sur un vrai serveur, tail attend les
              nouvelles lignes (Ctrl+C pour sortir). Ici, il affiche l'état
              actuel du fichier.

EXEMPLES
       tail -n 20 /var/log/syslog
       sudo tail -f /var/log/apache2/error.log`,
  run: (args, env) => headTail('tail', args, env),
};
