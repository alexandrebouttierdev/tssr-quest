import { describe, expect, it } from 'vitest';
import {
  formatJournalDate,
  formatLsDate,
  formatRelative,
  formatSystemdTimestamp,
  parisParts,
} from './time-format';

/** 3 novembre 2026, 8 h 14 min 03 s, heure de Paris (UTC+1). */
const T = Date.UTC(2026, 10, 3, 7, 14, 3);

describe('dates à la française', () => {
  it("décompose une date à l'heure de Paris", () => {
    expect(parisParts(T)).toMatchObject({
      year: 2026,
      month: 11,
      day: 3,
      hour: 8,
      minute: 14,
      second: 3,
      weekday: 2,
      zone: 'CET',
    });
    expect(parisParts(Date.UTC(2026, 6, 14, 10)).zone).toBe('CEST');
  });

  it('formate une date de journal comme journalctl en fr_FR', () => {
    expect(formatJournalDate(T)).toBe('nov. 03 08:14:03');
    expect(formatJournalDate(Date.UTC(2026, 2, 9, 7, 0, 0))).toBe('mars 09 08:00:00');
  });

  it('formate une date récente comme ls -l en fr_FR (mois alignés)', () => {
    expect(formatLsDate(T, T + 3_600_000)).toBe(' 3 nov.  08:14');
    expect(formatLsDate(Date.UTC(2026, 5, 2, 8, 42), T)).toBe(' 2 juin  10:42');
  });

  it("affiche l'année pour une date de plus de six mois", () => {
    expect(formatLsDate(Date.UTC(2025, 0, 2, 12), T)).toBe(' 2 janv.  2025');
  });

  it('formate un horodatage systemd (jour en anglais, comme systemd)', () => {
    expect(formatSystemdTimestamp(T)).toBe('Tue 2026-11-03 08:14:03 CET');
  });

  it.each([
    [0, 'now'],
    [4_000, '4s ago'],
    [90_000, '1min 30s ago'],
    [12 * 60_000, '12min ago'],
    [72 * 60_000, '1h 12min ago'],
    [7 * 3_600_000, '7h ago'],
    [26 * 3_600_000, '1 day 2h ago'],
    [3 * 86_400_000, '3 days ago'],
    [12 * 86_400_000 + 3 * 3_600_000, '1 week 5 days ago'],
    [14 * 86_400_000, '2 weeks ago'],
    [40 * 86_400_000, '1 month 9 days ago'],
  ])('formate un écart de %d ms en « %s »', (delta, text) => {
    expect(formatRelative(T - delta, T)).toBe(text);
  });
});
