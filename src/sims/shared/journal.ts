import type { LogLine, Machine } from './types';

/**
 * Ajoute des lignes au journal d'une unité.
 *
 * @param machine - Machine simulée.
 * @param unit - Unité (`apache2`, `ssh`…).
 * @param lines - Lignes à ajouter, dans l'ordre.
 * @returns Une nouvelle machine.
 */
export function appendLogs(machine: Machine, unit: string, lines: readonly LogLine[]): Machine {
  if (lines.length === 0) return machine;
  return {
    ...machine,
    logs: { ...machine.logs, [unit]: [...(machine.logs[unit] ?? []), ...lines] },
  };
}

/**
 * Toutes les lignes de journal de la machine, triées par date (comme `journalctl`).
 *
 * @param machine - Machine simulée.
 * @returns Les lignes avec leur unité d'origine.
 */
export function allLogs(machine: Machine): { unit: string; line: LogLine }[] {
  return Object.entries(machine.logs)
    .flatMap(([unit, lines]) => lines.map((line) => ({ unit, line })))
    .sort((a, b) => a.line.time - b.line.time);
}
