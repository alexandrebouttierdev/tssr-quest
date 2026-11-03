import { userGroups } from '@sims/shared/permissions';
import { formatJournalDate } from '@sims/shared/time-format';
import type { LogLine, Machine } from '@sims/shared/types';

/**
 * Indique si un compte peut lire le journal système : root, ou membre des groupes
 * `adm` ou `systemd-journal` (règle de journald sur Debian).
 *
 * @param machine - Machine simulée.
 * @param user - Compte qui lit.
 * @returns Vrai si le journal système est lisible.
 */
export function canReadJournal(machine: Machine, user: string): boolean {
  if (user === 'root') return true;
  const groups = userGroups(machine, user);
  return groups.includes('adm') || groups.includes('systemd-journal');
}

/**
 * Formate une ligne de journal comme `journalctl` (format court).
 *
 * @param machine - Machine (pour le nom d'hôte).
 * @param line - Ligne de journal.
 * @returns Par exemple `nov. 03 08:14:03 srv-web01 systemd[1]: Started …`.
 */
export function formatLogLine(machine: Machine, line: LogLine): string {
  return `${formatJournalDate(line.time)} ${machine.hostname} ${line.ident}[${line.pid}]: ${line.message}`;
}

/** Avertissement de journalctl pour un compte sans accès au journal système. */
export const JOURNAL_HINT =
  "Hint: You are currently not seeing messages from other users and the system.\n      Users in groups 'adm', 'systemd-journal' can see all messages.\n      Pass -q to turn off this notice.\n";
