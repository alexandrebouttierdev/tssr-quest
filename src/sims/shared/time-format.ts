/**
 * Formats de date des systèmes simulés, calculés à l'heure de Paris (fuseau de LabCorp)
 * avec les noms de mois de la locale glibc fr_FR.
 */

/** Mois abrégés de la locale fr_FR (glibc). */
const FR_MONTHS = [
  'janv.',
  'févr.',
  'mars',
  'avr.',
  'mai',
  'juin',
  'juil.',
  'août',
  'sept.',
  'oct.',
  'nov.',
  'déc.',
] as const;

/** Largeur du plus long mois abrégé : `ls` aligne les mois sur cette largeur. */
const FR_MONTH_WIDTH = Math.max(...FR_MONTHS.map((m) => m.length));

/** Jours abrégés en anglais, utilisés par systemd quelle que soit la locale. */
const EN_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

/** Composantes d'une date à l'heure de Paris. */
export interface ParisParts {
  readonly year: number;
  /** Mois de 1 à 12. */
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  /** Jour de la semaine, 0 = dimanche. */
  readonly weekday: number;
  /** Abréviation du fuseau (`CET` ou `CEST`). */
  readonly zone: string;
}

/** Formateur Intl réutilisé (sa création est coûteuse). */
const PARIS_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Paris',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
  weekday: 'short',
  hourCycle: 'h23',
  timeZoneName: 'short',
});

/**
 * Décompose un horodatage à l'heure de Paris.
 *
 * @param ms - Millisecondes depuis l'époque Unix.
 * @returns Les composantes de la date.
 */
export function parisParts(ms: number): ParisParts {
  const parts = Object.fromEntries(
    PARIS_FORMAT.formatToParts(new Date(ms)).map((p) => [p.type, p.value]),
  );
  const offsetName = parts['timeZoneName'] ?? '';
  // Selon le moteur, le fuseau est donné en abréviation (CET) ou en décalage (GMT+1).
  const zone = offsetName === 'GMT+2' || offsetName === 'CEST' ? 'CEST' : 'CET';
  return {
    year: Number(parts['year']),
    month: Number(parts['month']),
    day: Number(parts['day']),
    hour: Number(parts['hour']),
    minute: Number(parts['minute']),
    second: Number(parts['second']),
    weekday: EN_WEEKDAYS.indexOf((parts['weekday'] ?? 'Sun') as (typeof EN_WEEKDAYS)[number]),
    zone,
  };
}

/** Complète un nombre à deux chiffres. */
function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

/**
 * Mois abrégé en français.
 *
 * @param month - Mois de 1 à 12.
 * @returns Par exemple `nov.`.
 */
export function frenchMonth(month: number): string {
  return FR_MONTHS[month - 1] ?? '';
}

/**
 * Date d'une ligne de journal (`journalctl`, `systemctl status`) : `nov. 03 08:14:03`.
 *
 * @param ms - Horodatage.
 * @returns La date formatée.
 */
export function formatJournalDate(ms: number): string {
  const p = parisParts(ms);
  return `${frenchMonth(p.month)} ${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}

/**
 * Date de modification affichée par `ls -l` en fr_FR : jour, mois aligné, puis heure
 * (fichier de moins de six mois) ou année.
 *
 * @param ms - Date du fichier.
 * @param now - Date courante.
 * @returns Par exemple ` 3 nov.  08:14` ou ` 2 janv.  2025`.
 */
export function formatLsDate(ms: number, now: number): string {
  const p = parisParts(ms);
  const month = frenchMonth(p.month).padEnd(FR_MONTH_WIDTH);
  const sixMonths = 182.5 * 86_400_000;
  const recent = now - ms < sixMonths && ms - now < 3_600_000;
  const tail = recent ? `${pad2(p.hour)}:${pad2(p.minute)}` : ` ${p.year}`;
  return `${String(p.day).padStart(2)} ${month} ${tail}`;
}

/**
 * Horodatage systemd (`systemctl status`) : `Tue 2026-11-03 08:14:03 CET`.
 *
 * @param ms - Horodatage.
 * @returns La date formatée.
 */
export function formatSystemdTimestamp(ms: number): string {
  const p = parisParts(ms);
  return `${EN_WEEKDAYS[p.weekday] ?? 'Sun'} ${p.year}-${pad2(p.month)}-${pad2(p.day)} ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)} ${p.zone}`;
}

/** Mois abrégés en anglais (sortie de `at`, en-tête de cron). */
const EN_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Date au format de `ctime` (C) : `Tue Nov  3 23:00:00 2026`, utilisée par `at`, `atq`
 * et l'en-tête des tables cron.
 *
 * @param ms - Horodatage.
 * @returns La date formatée, heure de Paris.
 */
export function formatAtDate(ms: number): string {
  const p = parisParts(ms);
  return `${EN_WEEKDAYS[p.weekday] ?? 'Sun'} ${EN_MONTHS[p.month - 1] ?? 'Jan'} ${String(p.day).padStart(2)} ${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)} ${p.year}`;
}

/** Ajoute un « s » au pluriel. */
function plural(count: number, word: string): string {
  return `${count} ${word}${count > 1 ? 's' : ''}`;
}

/**
 * Durée écoulée au format de systemd (`1h 12min ago`, `1 week 5 days ago`).
 *
 * @param ms - Date passée.
 * @param now - Date courante.
 * @returns La durée relative, en anglais comme systemd.
 */
export function formatRelative(ms: number, now: number): string {
  const s = Math.max(0, Math.floor((now - ms) / 1000));
  const MIN = 60;
  const HOUR = 3600;
  const DAY = 86_400;
  const WEEK = 7 * DAY;
  const MONTH = 2_629_800;
  if (s === 0) return 'now';
  if (s >= MONTH) {
    const months = Math.floor(s / MONTH);
    const days = Math.floor((s % MONTH) / DAY);
    return `${plural(months, 'month')}${days ? ` ${plural(days, 'day')}` : ''} ago`;
  }
  if (s >= WEEK) {
    const weeks = Math.floor(s / WEEK);
    const days = Math.floor((s % WEEK) / DAY);
    return `${plural(weeks, 'week')}${days ? ` ${plural(days, 'day')}` : ''} ago`;
  }
  if (s >= 2 * DAY) return `${plural(Math.floor(s / DAY), 'day')} ago`;
  if (s >= 25 * HOUR) return `1 day ${Math.floor((s - DAY) / HOUR)}h ago`;
  if (s >= 6 * HOUR) return `${Math.floor(s / HOUR)}h ago`;
  if (s >= HOUR) return `${Math.floor(s / HOUR)}h ${Math.floor((s % HOUR) / MIN)}min ago`;
  if (s >= 5 * MIN) return `${Math.floor(s / MIN)}min ago`;
  if (s >= MIN) return `${Math.floor(s / MIN)}min ${s % MIN}s ago`;
  return `${s}s ago`;
}
