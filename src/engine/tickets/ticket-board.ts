import type { ContentIndex } from '@content/loader';
import type { GameState } from '@core/store/types';
import type { TicketPriority } from '@core/model';
import { missionAvailable } from '../dialogue/select-node';

/** Ticket ouvert affiché dans le HUD. */
export interface OpenTicket {
  readonly missionId: string;
  readonly number: number;
  readonly title: string;
  readonly priority: TicketPriority;
  /** Collègue qui confie la mission. */
  readonly giverName: string;
  /** Lieu où le trouver. */
  readonly zoneName: string;
}

/** Objectif actif résumé pour le HUD. */
export type ActiveObjective =
  | {
      /** Une mission est en cours : étape et objectifs cochés. */
      readonly kind: 'mission';
      readonly title: string;
      readonly ticketNumber: number | null;
      readonly stepIndex: number;
      readonly stepCount: number;
      readonly done: number;
      readonly total: number;
      /** Consigne de l'étape, si elle en a une. */
      readonly goal: string | null;
    }
  | {
      /** Aucune mission en cours : aller voir le collègue du ticket le plus urgent. */
      readonly kind: 'ticket';
      readonly ticket: OpenTicket;
    };

/** Tableau de bord des tickets lu par le HUD. */
export interface TicketBoard {
  /** Tickets disponibles, du plus urgent au moins urgent. */
  readonly open: readonly OpenTicket[];
  /** Incidents critiques ou hauts en attente (mission en cours comprise). */
  readonly alerts: number;
  readonly objective: ActiveObjective | null;
}

/** Ordre d'urgence des priorités. */
const URGENCY: Readonly<Record<TicketPriority, number>> = {
  critique: 0,
  haute: 1,
  normale: 2,
  basse: 3,
};

/** État de la partie utile au tableau des tickets. */
export type TicketBoardState = Pick<
  GameState,
  'progress' | 'progression' | 'inventory' | 'missionRun'
>;

/**
 * Calcule les tickets ouverts, le nombre d'alertes et l'objectif actif.
 *
 * Un ticket est « ouvert » quand sa mission est disponible (prérequis remplis, pas
 * encore faite). L'objectif actif est la mission en cours, sinon le ticket le plus
 * urgent.
 *
 * @param content - Contenu indexé.
 * @param state - État de la partie.
 * @returns Le tableau de bord.
 */
export function ticketBoard(content: ContentIndex, state: TicketBoardState): TicketBoard {
  const run = state.missionRun;
  const world = {
    flags: state.progress.flags,
    completedMissions: Object.keys(state.progress.completedMissions),
    items: state.inventory.items,
    level: state.progression.level,
    debriefed: state.progress.debriefed,
    activeMission: run?.missionId ?? null,
  };
  const open: OpenTicket[] = [];
  for (const mission of content.missions.values()) {
    if (!mission.ticket || !missionAvailable(mission, world)) continue;
    open.push({
      missionId: mission.id,
      number: mission.ticket.number,
      title: mission.title,
      priority: mission.ticket.priority,
      giverName: content.npcs.get(mission.giver)?.name ?? mission.giver,
      zoneName: content.zones.get(mission.zone)?.name ?? mission.zone,
    });
  }
  open.sort((a, b) => URGENCY[a.priority] - URGENCY[b.priority] || a.number - b.number);

  const runPriority = run?.ticket?.priority;
  const alerts =
    open.filter((t) => URGENCY[t.priority] <= 1).length +
    (runPriority !== undefined && URGENCY[runPriority] <= 1 ? 1 : 0);

  let objective: ActiveObjective | null = null;
  if (run) {
    const step = run.step;
    objective = {
      kind: 'mission',
      title: run.title,
      ticketNumber: run.ticket?.number ?? null,
      stepIndex: run.stepIndex,
      stepCount: run.stepCount,
      done: run.objectives.filter((o) => o.done).length,
      total: run.objectives.length,
      goal: step && (step.type === 'terminal' || step.type === 'editor') ? step.goal : null,
    };
  } else if (open[0]) {
    objective = { kind: 'ticket', ticket: open[0] };
  }
  return { open, alerts, objective };
}
