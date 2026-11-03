import { castDraft } from 'immer';
import type { TicketPriority } from '../model';
import type { SliceCreator } from './types';

/** Ligne affichée dans un terminal de mission. */
export interface TerminalLine {
  /** `input` : commande tapée (avec son invite) ; `system` : message du jeu. */
  readonly kind: 'input' | 'stdout' | 'stderr' | 'system';
  readonly text: string;
}

/** Objectif affiché dans la fenêtre de mission. */
export interface ObjectiveView {
  readonly id: string;
  readonly label: string;
  readonly done: boolean;
}

/** Option d'une étape à choix. */
export interface ChoiceOptionView {
  readonly id: string;
  readonly text: string;
}

/** Ce que l'interface doit afficher pour l'étape en cours, selon son type. */
export type StepView =
  | {
      readonly type: 'terminal';
      readonly id: string;
      readonly goal: string;
      readonly sim: 'bash' | 'cmd' | 'powershell' | 'ios';
      readonly machine: string;
      readonly prompt: string;
      readonly lines: readonly TerminalLine[];
    }
  | {
      readonly type: 'choice';
      readonly id: string;
      readonly question: string;
      readonly options: readonly ChoiceOptionView[];
      readonly multiple: boolean;
    }
  | { readonly type: 'input'; readonly id: string; readonly question: string }
  | {
      readonly type: 'ordering';
      readonly id: string;
      readonly question: string;
      readonly items: readonly ChoiceOptionView[];
    }
  | { readonly type: 'dialogue'; readonly id: string };

/**
 * Code d'un retour générique : l'interface le traduit (src/ui/strings), le moteur
 * ne contient aucun texte destiné au joueur.
 */
export type FeedbackCode = 'correct' | 'incorrect' | 'step-complete' | 'session-kept-open';

/** Retour affiché après une saisie (bonne réponse, erreur expliquée…). */
export interface FeedbackView {
  readonly kind: 'success' | 'error' | 'info';
  /** Texte du contenu (explication, retour d'une option), s'il existe. */
  readonly text?: string;
  /** Message générique à traduire par l'interface. */
  readonly code?: FeedbackCode;
}

/** Vue de la mission en cours, publiée par le moteur et lue par l'interface. */
export interface MissionRunView {
  readonly missionId: string;
  readonly title: string;
  readonly ticket?: { readonly number: number; readonly priority: TicketPriority };
  /** `intro` : dialogue d'introduction ; `step` : une étape est affichée. */
  readonly phase: 'intro' | 'step';
  readonly stepIndex: number;
  readonly stepCount: number;
  readonly step: StepView | null;
  readonly objectives: readonly ObjectiveView[];
  /** Indices déjà révélés pour l'étape en cours. */
  readonly hints: readonly string[];
  /** Nombre total d'indices disponibles pour l'étape. */
  readonly hintCount: number;
  /** Fiche « À retenir » liée à l'étape, si elle existe. */
  readonly sheet?: string;
  readonly feedback: FeedbackView | null;
  /** Vrai quand tous les objectifs de l'étape sont atteints (bouton « Continuer »). */
  readonly stepCompleted: boolean;
}

/** Actions de la tranche `missionRun`. */
export interface MissionRunActions {
  setMissionRun(view: MissionRunView | null): void;
}

/** Fabrique de la tranche `missionRun`. */
export const createMissionRunSlice: SliceCreator<
  { missionRun: MissionRunView | null } & MissionRunActions
> = (set) => ({
  missionRun: null,
  setMissionRun: (view) =>
    set((s) => {
      s.missionRun = castDraft(view);
    }),
});
