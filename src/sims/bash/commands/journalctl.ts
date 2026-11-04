import { allLogs } from '@sims/shared/journal';
import type { LogLine } from '@sims/shared/types';
import type { BashCommand } from '../command';
import { canReadJournal, formatLogLine, JOURNAL_HINT } from '../journal-view';

/** Explication détaillée (`-x`) d'une ligne de systemd, comme le catalogue de journald. */
function explain(line: LogLine): string[] {
  const started = /^Started (\S+)\.service/.exec(line.message);
  const failed = /^Failed to start (\S+)\.service/.exec(line.message);
  const unit = started?.[1] ?? failed?.[1];
  if (line.ident !== 'systemd' || unit === undefined) return [];
  const job = ((line.time / 1000) % 9000) | 0;
  const head = failed
    ? [`░░ Subject: A start job for unit ${unit}.service has failed`]
    : [`░░ Subject: A start job for unit ${unit}.service has finished successfully`];
  return [
    ...head,
    '░░ Defined-By: systemd',
    '░░ Support: https://www.debian.org/support',
    '░░ ',
    failed
      ? `░░ A start job for unit ${unit}.service has finished with a failure.`
      : `░░ A start job for unit ${unit}.service has finished successfully.`,
    '░░ ',
    `░░ The job identifier is ${job + 100} and the job result is ${failed ? 'failed' : 'done'}.`,
  ];
}

/** Niveaux de priorité de syslog, du plus grave (0) au plus bavard (7). */
const PRIORITIES = ['emerg', 'alert', 'crit', 'err', 'warning', 'notice', 'info', 'debug'];

/**
 * Priorité d'une ligne : systemd écrit ses échecs en « err » ; la sortie des services
 * (apachectl, sshd…) est enregistrée en « info », comme le fait journald.
 *
 * @param line - Ligne du journal.
 * @returns Priorité de 0 à 7.
 */
export function priorityOf(line: LogLine): number {
  if (line.ident === 'systemd' && /^(Failed to |Dependency failed|Timed out)/.test(line.message))
    return 3;
  if (line.ident === 'kernel' && /error|I\/O/i.test(line.message)) return 3;
  return 6;
}

/** Lit la valeur de -p : nom (err) ou numéro (3). */
function parsePriority(value: string): number | null {
  const index = PRIORITIES.indexOf(value);
  if (index >= 0) return index;
  return /^[0-7]$/.test(value) ? Number(value) : null;
}

/** Commande `journalctl` : consulte le journal de systemd. */
export const journalctl: BashCommand = {
  name: 'journalctl',
  summary: 'consulte le journal système (systemd)',
  manual: `NOM
       journalctl - consulter le journal de systemd

SYNOPSIS
       journalctl [OPTION]...

DESCRIPTION
       Affiche les messages enregistrés par les services.

       -u SERVICE   seulement les messages d'un service
       -n N         seulement les N dernières lignes
       -e           aller à la fin du journal
       -x           ajouter des explications aux messages de systemd
       -f           suivre le journal (ici : affiche les dernières lignes)

       Le journal complet n'est lisible que par root et les membres des
       groupes adm et systemd-journal.

EXEMPLES
       journalctl -u apache2
       sudo journalctl -xeu apache2`,
  run(args, env) {
    const units: string[] = [];
    let count: number | null = null;
    let explainLines = false;
    let end = false;
    let maxPriority = 7;
    let thisBoot = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i] ?? '';
      if (arg.startsWith('--unit=')) units.push(arg.slice(7));
      else if (arg === '--no-pager' || arg === '-q' || arg === '--quiet') continue;
      else if (arg === '-b' || arg === '--boot') {
        thisBoot = true;
        if (args[i + 1] === '0' || args[i + 1] === '-0') i++;
      } else if (arg.startsWith('--priority=')) {
        const p = parsePriority(arg.slice(11));
        if (p === null)
          return { stderr: `Failed to parse priority value: ${arg.slice(11)}\n`, exitCode: 1 };
        maxPriority = p;
      } else if (arg.startsWith('--lines=')) count = Number(arg.slice(8));
      else if (/^-[a-zA-Z]+$/.test(arg)) {
        for (let j = 1; j < arg.length; j++) {
          const letter = arg[j];
          if (letter === 'x') explainLines = true;
          else if (letter === 'e') end = true;
          else if (letter === 'f') count = count ?? 10;
          else if (letter === 'q') continue;
          else if (letter === 'b') thisBoot = true;
          else if (letter === 'u' || letter === 'n' || letter === 'p') {
            const value = arg.length > j + 1 ? arg.slice(j + 1) : args[++i];
            if (value === undefined)
              return {
                stderr: `journalctl: option requires an argument -- '${letter}'\n`,
                exitCode: 1,
              };
            if (letter === 'u') units.push(value);
            else if (letter === 'p') {
              const p = parsePriority(value);
              if (p === null)
                return { stderr: `Failed to parse priority value: ${value}\n`, exitCode: 1 };
              maxPriority = p;
            } else count = Number(value);
            break;
          } else {
            return { stderr: `journalctl: invalid option -- '${letter}'\n`, exitCode: 1 };
          }
        }
      } else {
        return { stderr: `Failed to add match '${arg}': Invalid argument\n`, exitCode: 1 };
      }
    }
    const allowed = canReadJournal(env.machine, env.user);
    const hint = allowed || args.includes('-q') ? '' : JOURNAL_HINT;
    let lines = allowed
      ? allLogs(env.machine)
          .filter(
            (l) =>
              (units.length === 0 ||
                units.map((u) => u.replace(/\.service$/, '')).includes(l.unit)) &&
              priorityOf(l.line) <= maxPriority &&
              (!thisBoot || l.line.time >= env.machine.bootTime),
          )
          .map((l) => l.line)
      : [];
    if (count !== null && Number.isFinite(count)) lines = lines.slice(-Math.max(0, count));
    else if (end) lines = lines.slice(-1000);
    if (lines.length === 0) return { stdout: '-- No entries --\n', stderr: hint, exitCode: 0 };
    const out = lines.flatMap((l) => [
      formatLogLine(env.machine, l),
      ...(explainLines ? explain(l) : []),
    ]);
    return { stdout: `${out.join('\n')}\n`, stderr: hint, exitCode: 0 };
  },
};
