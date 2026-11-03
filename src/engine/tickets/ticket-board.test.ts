import { describe, expect, it } from 'vitest';
import { compileContent } from '@content/compile';
import { indexContent } from '@content/loader';
import { createGameStore } from '@core/store/create-store';
import type { MissionRunView } from '@core/store/mission-run.slice';
import { VALID_CONTENT_FILES } from '@tests/fixtures/content';
import { ticketBoard } from './ticket-board';

const content = indexContent(compileContent(VALID_CONTENT_FILES).bundle);

describe('tableau des tickets', () => {
  it("liste les tickets disponibles et propose d'aller voir le collègue", () => {
    const board = ticketBoard(content, createGameStore().getState());

    expect(board.open).toEqual([
      {
        missionId: 'test.panne',
        number: 1,
        title: 'La panne',
        priority: 'haute',
        giverName: 'Hugo',
        zoneName: 'Salle serveurs',
      },
    ]);
    expect(board.alerts).toBe(1);
    expect(board.objective).toMatchObject({ kind: 'ticket', ticket: { number: 1 } });
  });

  it('résume la mission en cours : étape, objectifs cochés, consigne', () => {
    const run: MissionRunView = {
      missionId: 'test.panne',
      title: 'Panne',
      ticket: { number: 1, priority: 'haute' },
      phase: 'step',
      stepIndex: 0,
      stepCount: 4,
      step: {
        type: 'terminal',
        id: 'relance',
        goal: 'Relancer Apache',
        sim: 'bash',
        machine: 'srv',
        prompt: '$',
        lines: [],
      },
      objectives: [
        { id: 'a', label: 'A', done: true },
        { id: 'b', label: 'B', done: false },
      ],
      hints: [],
      hintCount: 0,
      feedback: null,
      stepCompleted: false,
    };
    const state = { ...createGameStore().getState(), missionRun: run };

    const board = ticketBoard(content, state);

    expect(board.open).toEqual([]);
    expect(board.alerts).toBe(1);
    expect(board.objective).toEqual({
      kind: 'mission',
      title: 'Panne',
      ticketNumber: 1,
      stepIndex: 0,
      stepCount: 4,
      done: 1,
      total: 2,
      goal: 'Relancer Apache',
    });
  });

  it("n'a plus d'objectif quand tout est fait", () => {
    const store = createGameStore();
    const record = { completedAt: 0, xp: 0, errors: 0, hintsUsed: 0, durationMs: 0 };
    store.getState().recordMissionCompleted('test.panne', record as never);
    store.getState().recordMissionCompleted('test.suite', record as never);

    const board = ticketBoard(content, store.getState());

    expect(board).toEqual({ open: [], alerts: 0, objective: null });
  });
});
