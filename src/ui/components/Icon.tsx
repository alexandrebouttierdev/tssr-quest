/** Noms des icônes de l'interface. */
export type IconName =
  'ticket' | 'alert' | 'clock' | 'target' | 'check' | 'chat' | 'hint' | 'sheet' | 'close';

/** Tracés des icônes (24 × 24, trait de 2 px, sans dépendance). */
const PATHS: Readonly<Record<IconName, string>> = {
  ticket:
    'M4 7a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2v-3a2 2 0 0 0 0-4Z M9 9h6 M9 15h6',
  alert: 'M12 4 3 20h18Z M12 10v4 M12 17h.01',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3 2',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M12 12h.01',
  check: 'm5 12 5 5 9-10',
  chat: 'M4 5h16v11H9l-5 4Z',
  hint: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3Z',
  sheet: 'M6 3h9l4 4v14H6Z M14 3v5h5 M9 13h7 M9 17h7',
  close: 'M6 6l12 12 M18 6 6 18',
};

/**
 * Petite icône vectorielle au trait, qui prend la couleur du texte.
 *
 * @param props - Nom et taille.
 * @returns L'icône (décorative).
 */
export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
