/**
 * Planification des tâches : tables cron des utilisateurs et travaux `at`.
 *
 * La table d'un utilisateur vit où cron la lit sur Debian, dans
 * /var/spool/cron/crontabs/<compte> (mode 600, groupe crontab), précédée de l'en-tête
 * « DO NOT EDIT » que `crontab -l` masque. `machine.crontabs` en garde la version
 * analysée pour les conditions de mission.
 */
import { formatAtDate } from './time-format';
import type { AtJob, CronEntry, Machine } from './types';

/** Dossier des tables cron des utilisateurs. */
export const SPOOL_DIR = '/var/spool/cron/crontabs';

/** Modèle proposé par `crontab -e` quand l'utilisateur n'a pas encore de table (Debian). */
export const CRONTAB_TEMPLATE = `# Edit this file to introduce tasks to be run by cron.
#
# Each task to run has to be defined through a single line
# indicating with different fields when the task will be run
# and what command to run for the task
#
# To define the time you can provide concrete values for
# minute (m), hour (h), day of month (dom), month (mon),
# and day of week (dow) or use '*' in these fields (for 'any').
#
# Notice that tasks will be started based on the cron's system
# daemon's notion of time and timezones.
#
# Output of the crontab jobs (including errors) is sent through
# email to the user the crontab file belongs to (unless redirected).
#
# For example, you can run a backup of all your user accounts
# at 5 a.m every week with:
# 0 5 * * 1 tar -zcf /var/backups/home.tgz /home/
#
# For more information see the manual pages of crontab(5) and cron(8)
#
# m h  dom mon dow   command
`;

/** Champs d'une planification : nom (pour les erreurs), bornes, noms acceptés. */
const FIELDS: readonly {
  readonly name: string;
  readonly min: number;
  readonly max: number;
  readonly names?: readonly string[];
}[] = [
  { name: 'minute', min: 0, max: 59 },
  { name: 'hour', min: 0, max: 23 },
  { name: 'day-of-month', min: 1, max: 31 },
  {
    name: 'month',
    min: 1,
    max: 12,
    names: ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'],
  },
  { name: 'day-of-week', min: 0, max: 7, names: ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] },
];

/** Raccourcis `@daily`, `@reboot`… acceptés par cron. */
const SHORTCUTS = [
  '@reboot',
  '@yearly',
  '@annually',
  '@monthly',
  '@weekly',
  '@daily',
  '@midnight',
  '@hourly',
];

/** Vrai si un champ de planification est valide : étoile, pas (« toutes les 5 »), plage, liste, noms. */
function validField(text: string, field: (typeof FIELDS)[number]): boolean {
  const value = (part: string): number | null => {
    if (/^\d+$/.test(part)) return Number(part);
    const index = field.names?.indexOf(part.toLowerCase()) ?? -1;
    return index >= 0 ? index + field.min : null;
  };
  return text.split(',').every((item) => {
    const [range = '', step] = item.split('/');
    if (step !== undefined && !/^\d+$/.test(step)) return false;
    if (range === '*') return true;
    const [from = '', to] = range.split('-');
    const a = value(from);
    const b = to === undefined ? a : value(to);
    return a !== null && b !== null && a >= field.min && b <= field.max && a <= b;
  });
}

/** Erreur de syntaxe d'une table cron (ligne et champ en cause). */
export interface CronError {
  readonly line: number;
  readonly message: string;
}

/**
 * Vérifie une table cron comme `crontab` avant de l'installer.
 *
 * @param text - Contenu de la table.
 * @returns Les erreurs (vide si la table est valide).
 */
export function validateCrontab(text: string): CronError[] {
  const errors: CronError[] = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (!line || line.startsWith('#')) return;
    if (/^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line)) return;
    const words = line.split(/\s+/);
    const first = words[0] ?? '';
    if (first.startsWith('@')) {
      if (!SHORTCUTS.includes(first))
        errors.push({ line: index + 1, message: 'bad time specifier' });
      else if (words.length < 2) errors.push({ line: index + 1, message: 'bad command' });
      return;
    }
    for (const [i, field] of FIELDS.entries()) {
      const part = words[i];
      if (part === undefined || !validField(part, field)) {
        errors.push({ line: index + 1, message: `bad ${field.name}` });
        return;
      }
    }
    if (words.length < 6) errors.push({ line: index + 1, message: 'bad command' });
  });
  return errors;
}

/**
 * Tâches d'une table cron (lignes actives, sans commentaires ni variables).
 *
 * @param text - Contenu de la table.
 * @returns Planification et commande de chaque tâche.
 */
export function parseCrontab(text: string): CronEntry[] {
  return text.split('\n').flatMap((raw) => {
    const line = raw.trim();
    if (!line || line.startsWith('#') || /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line)) return [];
    const words = line.split(/\s+/);
    const count = (words[0] ?? '').startsWith('@') ? 1 : 5;
    return [{ schedule: words.slice(0, count).join(' '), command: words.slice(count).join(' ') }];
  });
}

/** En-tête écrit par `crontab` dans le fichier de spool. */
function spoolHeader(source: string, now: number): string {
  return `# DO NOT EDIT THIS FILE - edit the master and reinstall.\n# (${source} installed on ${formatAtDate(now)})\n# (Cron version -- $Id: crontab.c,v 2.13 1994/01/17 03:20:37 vixie Exp $)\n`;
}

/**
 * Table cron installée d'un compte, sans l'en-tête (ce qu'affiche `crontab -l`).
 *
 * @param machine - Machine simulée.
 * @param user - Compte.
 * @returns Le contenu, ou `null` sans table.
 */
export function readCrontab(machine: Machine, user: string): string | null {
  const node = machine.fs[`${SPOOL_DIR}/${user}`];
  if (node?.type !== 'file') return null;
  const lines = node.content.split('\n');
  const skip = lines[0]?.startsWith('# DO NOT EDIT') ? 3 : 0;
  return lines.slice(skip).join('\n');
}

/**
 * Installe une table cron (déjà validée) pour un compte.
 *
 * @param machine - Machine simulée.
 * @param user - Compte propriétaire.
 * @param text - Contenu.
 * @param source - Fichier d'origine (pour l'en-tête).
 * @param now - Horodatage (ms).
 * @returns La machine avec la table installée.
 */
export function installCrontab(
  machine: Machine,
  user: string,
  text: string,
  source: string,
  now: number,
): Machine {
  const path = `${SPOOL_DIR}/${user}`;
  return {
    ...machine,
    fs: {
      ...machine.fs,
      [path]: {
        type: 'file',
        owner: user,
        group: 'crontab',
        mode: 0o600,
        mtime: now,
        content: spoolHeader(source, now) + text,
      },
    },
    crontabs: { ...machine.crontabs, [user]: parseCrontab(text) },
  };
}

/**
 * Supprime la table cron d'un compte.
 *
 * @param machine - Machine simulée.
 * @param user - Compte.
 * @returns La machine sans la table.
 */
export function removeCrontab(machine: Machine, user: string): Machine {
  const { [`${SPOOL_DIR}/${user}`]: _removed, ...fs } = machine.fs;
  const { [user]: _entries, ...crontabs } = machine.crontabs;
  return { ...machine, fs, crontabs };
}

// --- at ---------------------------------------------------------------------------------

/**
 * Lit une heure de lancement de `at` : `23:00`, `2300`, `now + 10 minutes`, `midnight`,
 * `noon`, `teatime`, `tomorrow`, éventuellement suivie de `tomorrow`.
 *
 * @param words - Mots de la spécification.
 * @param now - Date courante (ms).
 * @returns La date de lancement (ms), ou `null` si la spécification est illisible.
 */
export function parseAtTime(words: readonly string[], now: number): number | null {
  const text = words.join(' ').toLowerCase().trim();
  const relative = /^now(?:\s*\+\s*(\d+)\s*(minutes?|min|hours?|days?|weeks?))?$/.exec(text);
  if (relative) {
    const amount = Number(relative[1] ?? 0);
    const unit = relative[2] ?? 'minutes';
    const ms = unit.startsWith('min')
      ? 60_000
      : unit.startsWith('hour')
        ? 3_600_000
        : unit.startsWith('day')
          ? 86_400_000
          : 604_800_000;
    return Math.floor((now + amount * ms) / 60_000) * 60_000;
  }
  const match = /^(\d{1,2}):?(\d{2})?|^(midnight|noon|teatime|tomorrow)/.exec(text);
  if (!match) return null;
  // Heure de Paris : on travaille sur l'horloge locale du serveur.
  const offset = parisOffset(now);
  const local = new Date(now + offset);
  let hour = 0;
  let minute = 0;
  if (match[3] === 'noon') hour = 12;
  else if (match[3] === 'teatime') hour = 16;
  else if (match[3] === 'tomorrow') {
    hour = local.getUTCHours();
    minute = local.getUTCMinutes();
  } else if (match[3] !== 'midnight') {
    hour = Number(match[1]);
    minute = Number(match[2] ?? 0);
    if (match[2] === undefined && (match[1] ?? '').length > 2) return null;
  }
  if (hour > 23 || minute > 59) return null;
  const target =
    Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate(), hour, minute) -
    offset;
  const tomorrow = text.includes('tomorrow');
  // Une heure déjà passée aujourd'hui désigne le lendemain.
  return tomorrow || target <= now ? target + 86_400_000 : target;
}

/** Décalage de l'heure de Paris (ms) à une date donnée. */
function parisOffset(ms: number): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Paris',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const diff = (hour - new Date(ms).getUTCHours() + 24) % 24;
  return diff * 3_600_000;
}

/**
 * Programme un travail `at`.
 *
 * @param machine - Machine simulée.
 * @param user - Compte.
 * @param time - Date de lancement (ms).
 * @param commands - Commandes à exécuter.
 * @returns La machine et le travail créé.
 */
export function addAtJob(
  machine: Machine,
  user: string,
  time: number,
  commands: string,
): { machine: Machine; job: AtJob } {
  const jobs = machine.atJobs ?? [];
  const job: AtJob = { id: Math.max(0, ...jobs.map((j) => j.id)) + 1, user, time, commands };
  return { machine: { ...machine, atJobs: [...jobs, job] }, job };
}
