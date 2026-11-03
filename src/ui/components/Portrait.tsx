import { useState, type CSSProperties } from 'react';
import styles from './Portrait.module.css';

/** Expressions présentes dans chaque feuille de portraits, dans l'ordre des colonnes. */
const MOODS = ['neutre', 'content', 'inquiet'] as const;

/**
 * Adresse de la feuille de portraits d'un personnage (générée par
 * assets/generators/portraits.ts), relative à la base du site.
 *
 * @param id - Identifiant du PNJ, ou `joueur`.
 * @returns L'URL du PNG.
 */
export function portraitUrl(id: string): string {
  return `${import.meta.env.BASE_URL}sprites/portraits/${id}.png`;
}

/** Propriétés d'un portrait. */
export interface PortraitProps {
  /** Identifiant du PNJ, ou `joueur`. */
  readonly id: string;
  /** Nom, pour l'initiale de secours si l'image manque. */
  readonly name: string;
  /** Expression (`neutre` par défaut). */
  readonly mood?: string | undefined;
  /** Taille affichée en pixels CSS (multiple de 48 pour un pixel art net). */
  readonly size: number;
  readonly className?: string | undefined;
}

/**
 * Portrait pixel art d'un personnage, agrandi sans flou, avec l'expression demandée.
 * Si l'image est introuvable, affiche l'initiale du nom.
 *
 * @param props - Personnage, expression et taille.
 * @returns Le portrait (décoratif pour les lecteurs d'écran).
 */
export function Portrait({ id, name, mood, size, className }: PortraitProps) {
  const [broken, setBroken] = useState(false);
  const index = Math.max(0, MOODS.indexOf((mood ?? 'neutre') as (typeof MOODS)[number]));
  return (
    <div
      className={[styles['portrait'], className].filter(Boolean).join(' ')}
      style={{ '--size': `${size}px`, '--index': index } as CSSProperties}
      aria-hidden="true"
      data-mood={mood ?? 'neutre'}
    >
      {broken ? (
        <span className={styles['initial']}>{name.slice(0, 1)}</span>
      ) : (
        <img
          className={styles['sheet']}
          src={portraitUrl(id)}
          alt=""
          draggable={false}
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}
