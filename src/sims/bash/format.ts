/**
 * Mise en forme commune des sorties de commandes (droits, colonnes, tableaux).
 */
import type { FsNode } from '@sims/shared/types';

/** Collation française qui ignore la ponctuation, comme `ls` en fr_FR (strcoll). */
const COLLATOR = new Intl.Collator('fr', { ignorePunctuation: true, sensitivity: 'base' });

/** Départage à égalité : minuscules avant majuscules, comme la collation glibc fr_FR. */
const TIE_BREAKER = new Intl.Collator('fr', { sensitivity: 'variant', caseFirst: 'lower' });

/**
 * Compare deux noms de fichiers comme `ls` en locale française.
 *
 * @param a - Premier nom.
 * @param b - Second nom.
 * @returns Négatif, nul ou positif.
 */
export function compareNames(a: string, b: string): number {
  return COLLATOR.compare(a, b) || TIE_BREAKER.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0);
}

/**
 * Chaîne de droits de `ls -l` : `-rw-r--r--`, `drwxrwxrwt`, `lrwxrwxrwx`, `-rwsr-xr-x`.
 *
 * @param node - Nœud du système de fichiers.
 * @returns Les dix caractères de type et de droits.
 */
export function modeString(node: FsNode): string {
  const type = node.type === 'dir' ? 'd' : node.type === 'symlink' ? 'l' : '-';
  const m = node.mode;
  const triplet = (shift: number, special: number, specialChar: string) => {
    const r = m & (4 << shift) ? 'r' : '-';
    const w = m & (2 << shift) ? 'w' : '-';
    const x = (m & (1 << shift)) !== 0;
    const s = (m & special) !== 0;
    const last = s ? (x ? specialChar : specialChar.toUpperCase()) : x ? 'x' : '-';
    return r + w + last;
  };
  return type + triplet(6, 0o4000, 's') + triplet(3, 0o2000, 's') + triplet(0, 0o1000, 't');
}

/**
 * Dispose des noms en colonnes comme `ls` dans un terminal de 80 caractères
 * (remplissage colonne par colonne).
 *
 * @param names - Noms à afficher.
 * @param width - Largeur du terminal.
 * @returns Le texte, terminé par une fin de ligne (vide si aucun nom).
 */
export function formatColumns(names: readonly string[], width = 80): string {
  if (names.length === 0) return '';
  for (let cols = names.length; cols >= 1; cols--) {
    const rows = Math.ceil(names.length / cols);
    const usedCols = Math.ceil(names.length / rows);
    const widths: number[] = [];
    for (let c = 0; c < usedCols; c++) {
      const column = names.slice(c * rows, c * rows + rows);
      widths.push(Math.max(...column.map((n) => n.length)));
    }
    const total = widths.reduce((sum, w) => sum + w, 0) + 2 * (usedCols - 1);
    if (total <= width || cols === 1) {
      const lines: string[] = [];
      for (let r = 0; r < rows; r++) {
        const cells: string[] = [];
        for (let c = 0; c < usedCols; c++) {
          const name = names[c * rows + r];
          if (name === undefined) continue;
          const isLastInRow = c === usedCols - 1 || names[(c + 1) * rows + r] === undefined;
          cells.push(isLastInRow ? name : name.padEnd((widths[c] ?? 0) + 2));
        }
        lines.push(cells.join(''));
      }
      return `${lines.join('\n')}\n`;
    }
  }
  return '';
}

/**
 * Aligne un tableau : chaque colonne est alignée à gauche (`l`) ou à droite (`r`),
 * les colonnes sont séparées par une espace.
 *
 * @param rows - Lignes du tableau (cellules texte).
 * @param align - Alignement de chaque colonne.
 * @returns Les lignes alignées, sans espaces en fin de ligne.
 */
export function alignTable(
  rows: readonly (readonly string[])[],
  align: readonly ('l' | 'r')[],
): string[] {
  const widths = align.map((_, c) => Math.max(...rows.map((r) => (r[c] ?? '').length)));
  return rows.map((row) =>
    row
      .map((cell, c) =>
        align[c] === 'r' ? cell.padStart(widths[c] ?? 0) : cell.padEnd(widths[c] ?? 0),
      )
      .join(' ')
      .trimEnd(),
  );
}
