/**
 * État global de la machine vu par `free`, `uptime` et `top` : mémoire, charge et
 * durée de fonctionnement, calculés une seule fois pour que les trois commandes
 * affichent les mêmes chiffres.
 */
import { TOTAL_MEMORY_KIB } from './processes';
import type { Machine } from './types';

/** Mémoire en Kio, au sens de `free`. */
export interface MemoryStats {
  readonly total: number;
  readonly used: number;
  readonly free: number;
  readonly shared: number;
  readonly buffCache: number;
  readonly available: number;
  readonly swapTotal: number;
  readonly swapUsed: number;
}

/** Mémoire du noyau et des services non modélisés (Kio). */
const SYSTEM_RESERVED_KIB = 300 * 1024;
/** Cache disque et tampons (Kio). */
const BUFF_CACHE_KIB = 764_109;
/** Partition d'échange de l'installation Debian par défaut (975 Mio). */
const SWAP_KIB = 998_396;

/**
 * Mémoire de la machine : processus simulés plus une part fixe pour le système.
 *
 * @param machine - Machine simulée.
 * @returns Les compteurs en Kio.
 */
export function memoryStats(machine: Machine): MemoryStats {
  const used = Math.min(
    TOTAL_MEMORY_KIB - BUFF_CACHE_KIB,
    machine.processes.reduce((sum, p) => sum + p.rss, 0) + SYSTEM_RESERVED_KIB,
  );
  // Au-delà de la mémoire vive, le système déborde sur l'échange.
  const overflow = Math.max(
    0,
    machine.processes.reduce((sum, p) => sum + p.rss, 0) + SYSTEM_RESERVED_KIB - used,
  );
  return {
    total: TOTAL_MEMORY_KIB,
    used,
    free: TOTAL_MEMORY_KIB - used - BUFF_CACHE_KIB,
    shared: 1_100,
    buffCache: BUFF_CACHE_KIB,
    available: TOTAL_MEMORY_KIB - used,
    swapTotal: SWAP_KIB,
    swapUsed: Math.min(SWAP_KIB, overflow),
  };
}

/**
 * Charge moyenne sur 1, 5 et 15 minutes : la somme des %CPU des processus.
 *
 * @param machine - Machine simulée.
 * @returns Les trois moyennes.
 */
export function loadAverages(machine: Machine): readonly [number, number, number] {
  const load = machine.processes.reduce((sum, p) => sum + p.cpu, 0) / 100;
  return [load, load * 0.6, load * 0.3];
}

/** Durée de fonctionnement découpée. */
export interface UptimeParts {
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
}

/**
 * Temps écoulé depuis le démarrage.
 *
 * @param machine - Machine simulée.
 * @param now - Date courante (ms).
 * @returns Jours, heures, minutes.
 */
export function uptimeParts(machine: Machine, now: number): UptimeParts {
  const seconds = Math.max(0, Math.floor((now - machine.bootTime) / 1000));
  return {
    days: Math.floor(seconds / 86_400),
    hours: Math.floor((seconds % 86_400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
  };
}

/**
 * Durée au format de la première ligne de `uptime` et de `top` (procps-ng) :
 * `up 2 days,  3:12` ou `up 14 min`.
 *
 * @param parts - Durée.
 * @returns Le texte, sans l'heure ni la charge.
 */
export function uptimeText(parts: UptimeParts): string {
  const days = parts.days > 0 ? `${parts.days} day${parts.days > 1 ? 's' : ''}, ` : '';
  const time =
    parts.days === 0 && parts.hours === 0
      ? `${parts.minutes} min`
      : `${String(parts.hours).padStart(2)}:${String(parts.minutes).padStart(2, '0')}`;
  return `up ${days}${time}`;
}

/**
 * Charge moyenne avec la virgule décimale française.
 *
 * @param machine - Machine simulée.
 * @returns `0,08, 0,03, 0,01`.
 */
export function loadText(machine: Machine): string {
  return loadAverages(machine)
    .map((v) => v.toFixed(2).replace('.', ','))
    .join(', ');
}
