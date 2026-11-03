/**
 * `npm run content:build` : compile content/**.yaml en JSON validé
 * (src/content/generated/content.json). Échoue au moindre problème de contenu.
 */
import { buildContent, printErrors, writeGenerated } from './content-files';

const { bundle, errors } = buildContent();
if (errors.length > 0) {
  printErrors(errors);
  console.error(`\n${errors.length} erreur(s) de contenu.`);
  process.exit(1);
}
writeGenerated(bundle);
console.log(
  `Contenu compilé : ${bundle.chapters.length} chapitre(s), ${bundle.missions.length} mission(s), ${bundle.dialogues.length} dialogue(s), ${bundle.npcs.length} PNJ, ${bundle.sheets.length} fiche(s).`,
);
