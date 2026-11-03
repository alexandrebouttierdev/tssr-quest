/**
 * Vérifie la cohérence globale du contenu : schémas Zod, références croisées,
 * prérequis sans cycle, textes en français, fourchette d'XP (docs/04).
 */
import { buildContent, printErrors } from './content-files';

const { bundle, errors } = buildContent();
if (errors.length > 0) {
  printErrors(errors);
  process.exit(1);
}
console.log(
  `✓ Contenu cohérent (${bundle.missions.length} mission(s), ${bundle.dialogues.length} dialogue(s)).`,
);
