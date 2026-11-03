/**
 * Codes d'erreur système (errno) utilisés par le système de fichiers simulé,
 * et leur message `strerror` en français, tel qu'affiché par une Debian 12 en fr_FR.
 */
export const ERRNO_MESSAGES = {
  ENOENT: 'Aucun fichier ou dossier de ce type',
  EACCES: 'Permission non accordée',
  EEXIST: 'Le fichier existe',
  ENOTDIR: "N'est pas un dossier",
  EISDIR: 'Est un dossier',
  ENOTEMPTY: "Le dossier n'est pas vide",
  EPERM: 'Opération non permise',
  ELOOP: 'Trop de niveaux de liens symboliques',
  ENOSPC: 'Aucun espace disponible sur le périphérique',
  EINVAL: 'Argument invalide',
  EBUSY: 'Périphérique ou ressource occupé',
  ESRCH: 'Aucun processus de ce type',
} as const;

/** Code d'erreur système. */
export type Errno = keyof typeof ERRNO_MESSAGES;

/**
 * Message `strerror` français d'un code d'erreur.
 *
 * @param code - Code errno.
 * @returns Le message, par exemple « Permission non accordée ».
 */
export function strerror(code: Errno): string {
  return ERRNO_MESSAGES[code];
}
