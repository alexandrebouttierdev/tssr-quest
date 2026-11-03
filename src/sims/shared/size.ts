/** Multiplicateurs des suffixes de taille (puissances de 1024, comme `df -h`). */
const UNITS = ['K', 'M', 'G', 'T', 'P'] as const;

/**
 * Lit une taille écrite par un auteur de mission (`20G`, `1,5M`, `512`).
 *
 * @param value - Taille en octets (nombre) ou texte avec suffixe binaire.
 * @returns Le nombre d'octets.
 * @throws {Error} Si le texte n'est pas une taille.
 */
export function parseSize(value: string | number): number {
  if (typeof value === 'number') return value;
  const match = /^(\d+(?:[.,]\d+)?)\s*([KMGTP]?)i?B?$/i.exec(value.trim());
  if (!match) throw new Error(`Taille invalide : « ${value} »`);
  const amount = Number((match[1] ?? '0').replace(',', '.'));
  const unit = (match[2] ?? '').toUpperCase();
  const power = unit === '' ? 0 : UNITS.indexOf(unit as (typeof UNITS)[number]) + 1;
  return Math.round(amount * 1024 ** power);
}

/**
 * Formate une taille comme `df -h` ou `ls -lh` sur une Debian en fr_FR :
 * arrondi au supérieur, une décimale (virgule) sous 10, entier au-delà.
 *
 * @param bytes - Nombre d'octets.
 * @returns Par exemple `0`, `4,0K`, `6,1G`, `20G`.
 */
export function formatHumanSize(bytes: number): string {
  if (bytes < 1024) return String(Math.ceil(bytes));
  let value = bytes;
  let unitIndex = -1;
  while (value >= 1024 && unitIndex < UNITS.length - 1) {
    value /= 1024;
    unitIndex++;
  }
  // Epsilon : évite qu'une erreur d'arrondi flottant (6,1 → 6,1000000001) fasse monter d'un cran.
  let rounded = value < 10 ? Math.ceil(value * 10 - 1e-12) / 10 : Math.ceil(value - 1e-12);
  if (rounded >= 1024 && unitIndex < UNITS.length - 1) {
    rounded = 1;
    unitIndex++;
  }
  const unit = UNITS[unitIndex] ?? '';
  const text = rounded < 10 ? rounded.toFixed(1).replace('.', ',') : String(rounded);
  return text + unit;
}
