import { describe, expect, it } from 'vitest';
import { examXp, gradeExam } from './grade';

describe('notation des épreuves', () => {
  it('donne 20 sans indice ni erreur', () => {
    expect(gradeExam({ hintsUsed: 0, errors: 0 })).toEqual({
      result: 12,
      autonomy: 4,
      rigor: 4,
      total: 20,
    });
  });

  it('retire un point par indice et par erreur', () => {
    const grade = gradeExam({ hintsUsed: 2, errors: 1 });
    expect(grade).toMatchObject({ autonomy: 2, rigor: 3, total: 17 });
  });

  it('ne descend jamais sous 12 pour une épreuve terminée', () => {
    expect(gradeExam({ hintsUsed: 9, errors: 9 }).total).toBe(12);
  });

  it('accorde la mention à partir de 16', () => {
    expect(examXp(15.5)).toBe(200);
    expect(examXp(16)).toBe(300);
  });
});
