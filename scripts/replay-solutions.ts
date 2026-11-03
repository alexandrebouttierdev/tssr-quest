/**
 * Rejoue la solution de référence de chaque étape de chaque mission (docs/04) :
 * aucune étape ne doit être réussie au départ, toutes doivent l'être après la
 * solution, sans erreur comptée. Une mission non résolvable fait échouer la CI.
 */
import { createRng, seedFromString } from '../src/core/random/rng';
import { replayMission } from '../src/engine/missions/replay';
import { buildContent, printErrors } from './content-files';

const { bundle, errors } = buildContent();
if (errors.length > 0) {
  printErrors(errors);
  process.exit(1);
}

let failures = 0;
for (const mission of bundle.missions) {
  const report = replayMission(mission, {
    now: new Date(Date.UTC(2026, 10, 3, 8, 30)),
    rng: createRng(seedFromString(mission.id)),
  });
  const problems: string[] = [];
  for (const step of report) {
    if (step.trivial) problems.push(`étape ${step.stepId} : déjà réussie au départ`);
    if (!step.solved)
      problems.push(
        `étape ${step.stepId} : non résolue par la solution (objectifs manquants : ${step.missing.join(', ') || 'aucun'})`,
      );
    if (step.errors > 0)
      problems.push(
        `étape ${step.stepId} : ${step.errors} erreur(s) comptée(s) pendant la solution`,
      );
  }
  if (report.length < mission.steps.length && problems.length === 0)
    problems.push('rejeu interrompu');
  if (problems.length === 0) {
    console.log(`✓ ${mission.id} (${report.length} étape(s))`);
  } else {
    failures++;
    for (const p of problems) console.error(`✗ ${mission.id} — ${p}`);
  }
}
if (failures > 0) {
  console.error(`\n${failures} mission(s) en échec.`);
  process.exit(1);
}
console.log(`\nToutes les solutions de référence passent (${bundle.missions.length} mission(s)).`);
