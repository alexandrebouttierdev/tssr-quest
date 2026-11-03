import { describe, expect, it } from 'vitest';
import { normalizeAnswer } from './input.step';
import { dialogueStep } from './dialogue.step';
import { createRng } from '@core/random/rng';
import type { MissionRun } from '../types';

describe('normalisation des réponses', () => {
  it.each([
    [' Apache2 ', ['trim', 'lower'], 'apache2'],
    ['255. 255.0 .0', ['nospace'], '255.255.0.0'],
    ['192.168.010.001', ['ip'], '192.168.10.1'],
    ['  x ', [], '  x '],
  ] as const)('normalise « %s »', (text, rules, expected) => {
    expect(normalizeAnswer(text, rules)).toBe(expected);
  });
});

describe('étape de dialogue', () => {
  const step = { id: 'd', type: 'dialogue' as const, node: 'hugo#intro' };
  const run = {
    step: {
      data: { type: 'dialogue' },
      completed: false,
      errors: 0,
      hintsRevealed: 0,
      feedback: null,
    },
  } as unknown as MissionRun;

  it('se termine quand le moteur signale la fin du nœud', () => {
    expect(
      dialogueStep.init(step, { machines: {} }, { now: new Date(0), rng: createRng(1) }),
    ).toEqual({ type: 'dialogue' });
    expect(dialogueStep.view(step, run)).toEqual({ type: 'dialogue', id: 'd' });
    expect(dialogueStep.objectives(step, run)).toEqual([]);
    expect(
      dialogueStep.input(step, run, { done: true }, { now: new Date(0), rng: createRng(1) })
        .verdict,
    ).toBe(true);
    expect(
      dialogueStep.input(step, run, {}, { now: new Date(0), rng: createRng(1) }).verdict,
    ).toBeNull();
    expect(dialogueStep.isComplete(step, run)).toBe(false);
    expect(dialogueStep.referenceInputs(step, run)).toEqual([{ done: true }]);
  });
});
