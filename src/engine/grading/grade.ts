/**
 * Notation des épreuves de chapitre sur 20 (docs/01-game-design.md, « Épreuves et
 * badges »). Une épreuve ne se termine qu'une fois tous ses objectifs atteints : la note
 * mesure donc la façon d'y arriver, avec un barème lisible par le joueur.
 *
 * - Résultat : 12 points, acquis dès que l'épreuve est terminée.
 * - Autonomie : 4 points, moins 1 point par indice révélé.
 * - Rigueur : 4 points, moins 1 point par erreur : mauvaise réponse (QCM, saisie, ordre)
 *   ou action ratée dans un terminal (commande inconnue, droits manquants…). Explorer
 *   (`ls` d'un dossier absent, `systemctl status`) n'est pas une erreur.
 */

/** Points du résultat (objectifs atteints). */
export const RESULT_POINTS = 12;
/** Points d'autonomie (indices). */
export const AUTONOMY_POINTS = 4;
/** Points de rigueur (erreurs). */
export const RIGOR_POINTS = 4;
/** XP d'une épreuve réussie. */
export const EXAM_XP = 200;
/** XP supplémentaire pour une mention (note ≥ 16). */
export const HONOURS_XP = 100;
/** Note à partir de laquelle la mention est accordée. */
export const HONOURS_THRESHOLD = 16;

/** Ce que l'on sait de la façon dont le joueur a mené l'épreuve. */
export interface ExamPerformance {
  readonly hintsUsed: number;
  /** Erreurs comptées par les étapes (mauvaises réponses, actions ratées). */
  readonly errors: number;
}

/** Note détaillée d'une épreuve. */
export interface ExamGrade {
  readonly result: number;
  readonly autonomy: number;
  readonly rigor: number;
  /** Note finale sur 20. */
  readonly total: number;
}

/**
 * Calcule la note d'une épreuve.
 *
 * @param performance - Indices et erreurs de l'épreuve.
 * @returns La note et son détail.
 */
export function gradeExam(performance: ExamPerformance): ExamGrade {
  const autonomy = Math.max(0, AUTONOMY_POINTS - performance.hintsUsed);
  const rigor = Math.max(0, RIGOR_POINTS - performance.errors);
  return { result: RESULT_POINTS, autonomy, rigor, total: RESULT_POINTS + autonomy + rigor };
}

/**
 * XP accordée par une épreuve réussie, selon sa note.
 *
 * @param grade - Note sur 20.
 * @returns 200, ou 300 avec la mention.
 */
export function examXp(grade: number): number {
  return EXAM_XP + (grade >= HONOURS_THRESHOLD ? HONOURS_XP : 0);
}
