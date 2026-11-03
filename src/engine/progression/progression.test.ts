import { describe, expect, it } from 'vitest';
import { gainXp, LEVEL_THRESHOLDS, levelForXp, xpProgress } from './levels';
import { addSkillPoints, perksFor, skillTier } from './skills';

describe('niveaux', () => {
  it('suit la table de docs/01', () => {
    expect(LEVEL_THRESHOLDS).toEqual([0, 300, 800, 1500, 2500, 3800, 5400, 7300, 9500, 12000]);
  });

  it.each([
    [0, 1],
    [299, 1],
    [300, 2],
    [2499, 4],
    [12000, 10],
    [99999, 10],
  ])('donne le niveau %d XP → %d', (xp, level) => {
    expect(levelForXp(xp)).toBe(level);
  });

  it("ajoute de l'XP et liste les niveaux franchis", () => {
    expect(gainXp({ xp: 250, level: 1 }, 600)).toEqual({ xp: 850, level: 3, levelsGained: [2, 3] });
    expect(gainXp({ xp: 0, level: 1 }, 10)).toEqual({ xp: 10, level: 1, levelsGained: [] });
  });

  it('ignore un gain négatif', () => {
    expect(gainXp({ xp: 100, level: 1 }, -50).xp).toBe(100);
  });

  it('calcule la progression dans le niveau courant', () => {
    expect(xpProgress(550)).toEqual({ level: 2, current: 250, needed: 500, ratio: 0.5 });
    expect(xpProgress(13000)).toEqual({ level: 10, current: 1000, needed: 0, ratio: 1 });
  });
});

describe('compétences', () => {
  it('ajoute des points en plafonnant à 100', () => {
    const skills = {
      support: 0,
      reseau: 0,
      windows: 0,
      linux: 95,
      virtualisation: 0,
      securite: 0,
      scripting: 0,
      sauvegarde: 0,
    };

    const result = addSkillPoints(skills, { linux: 12, support: 3 });

    expect(result.skills.linux).toBe(100);
    expect(result.skills.support).toBe(3);
    expect(result.tiersReached).toEqual([{ skill: 'linux', tier: 100 }]);
  });

  it('donne le palier atteint', () => {
    expect(skillTier(24)).toBe(0);
    expect(skillTier(25)).toBe(25);
    expect(skillTier(77)).toBe(75);
  });

  it('liste les avantages débloqués', () => {
    expect(perksFor(60)).toEqual({
      freeHint: true,
      autocomplete: true,
      advancedSheets: false,
      honorTitle: false,
    });
  });
});
