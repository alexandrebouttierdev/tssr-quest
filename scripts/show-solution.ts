/**
 * Affiche la transcription des étapes de terminal d'une mission rejouée avec sa
 * solution de référence (relecture du contenu : sorties fidèles, pas d'erreur).
 *
 * Usage : npx tsx scripts/show-solution.ts <id-de-mission>
 */
import { createRng, seedFromString } from '../src/core/random/rng';
import { advance, startMission, submitInput } from '../src/engine/missions/mission-runner';
import { handlerFor } from '../src/engine/missions/step-registry';
import { buildContent, printErrors } from './content-files';

const id = process.argv[2];
const { bundle, errors } = buildContent();
if (errors.length > 0) {
  printErrors(errors);
  process.exit(1);
}
const mission = bundle.missions.find((m) => m.id === id);
if (!mission) {
  console.error(`Mission inconnue : ${id ?? '(aucune)'}`);
  process.exit(1);
}
const ctx = {
  now: new Date(Date.UTC(2026, 10, 3, 8, 30)),
  rng: createRng(seedFromString(mission.id)),
};
let run = startMission(mission, ctx);
for (const step of mission.steps) {
  console.log(`\n===== ${step.id} (${step.type}) =====`);
  for (const payload of handlerFor(step).referenceInputs(step, run))
    run = submitInput(mission, run, payload, ctx);
  if (run.step.data.type === 'terminal') {
    for (const line of run.step.data.lines) console.log(line.text);
  }
  if (step.type === 'editor') {
    const node = run.machines[step.machine]?.fs[step.file];
    console.log(node?.type === 'file' ? node.content : '(fichier absent)');
  }
  const objectives = handlerFor(step).objectives(step, run);
  for (const o of objectives) console.log(`${o.done ? '☑' : '☐'} ${o.label}`);
  console.log(`erreurs : ${run.step.errors} ; réussie : ${run.step.completed}`);
  if (!run.step.completed) break;
  run = advance(mission, run, ctx).run;
}
