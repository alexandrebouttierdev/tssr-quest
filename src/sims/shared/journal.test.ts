import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { allLogs, appendLogs } from './journal';

describe('journaux', () => {
  it("ajoute des lignes au journal d'une unité", () => {
    const machine = debianServer({});

    const after = appendLogs(machine, 'test', [{ time: 5, ident: 'x', pid: 9, message: 'a' }]);

    expect(after.logs['test']).toEqual([{ time: 5, ident: 'x', pid: 9, message: 'a' }]);
  });

  it("renvoie la même machine quand il n'y a rien à ajouter", () => {
    const machine = debianServer({});

    expect(appendLogs(machine, 'test', [])).toBe(machine);
  });

  it('fusionne toutes les unités par ordre chronologique', () => {
    const base = { ...debianServer({}), logs: {} };
    const machine = appendLogs(
      appendLogs(base, 'b', [{ time: 2, ident: 'b', pid: 2, message: 'deux' }]),
      'a',
      [
        { time: 1, ident: 'a', pid: 1, message: 'un' },
        { time: 3, ident: 'a', pid: 1, message: 'trois' },
      ],
    );

    expect(allLogs(machine).map((l) => `${l.unit}:${l.line.message}`)).toEqual([
      'a:un',
      'b:deux',
      'a:trois',
    ]);
  });
});
