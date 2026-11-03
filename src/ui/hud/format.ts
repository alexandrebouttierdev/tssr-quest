/**
 * Formats de date et d'heure du HUD, à l'heure de Paris (le jeu se déroule à Nantes).
 */

const TIME = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  hour: '2-digit',
  minute: '2-digit',
});

const DAY = new Intl.DateTimeFormat('fr-FR', {
  timeZone: 'Europe/Paris',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});

/**
 * Heure de jeu : `09:26`.
 *
 * @param date - Date de la partie.
 * @returns L'heure à Paris.
 */
export function formatGameTime(date: Date): string {
  return TIME.format(date);
}

/**
 * Jour de jeu : `mar. 3 nov.`.
 *
 * @param date - Date de la partie.
 * @returns Le jour abrégé à Paris.
 */
export function formatGameDay(date: Date): string {
  return DAY.format(date);
}
