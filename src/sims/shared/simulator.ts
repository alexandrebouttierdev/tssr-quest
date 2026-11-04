import type { SimContext } from './types';

/** Effet particulier demandé à l'interface par une commande. */
export type SimEffect =
  /** Effacer l'écran du terminal (`clear`). */
  | { readonly type: 'clear' }
  /** Fermer la session (`exit`, `logout`). */
  | { readonly type: 'exit' }
  /** Ouvrir l'éditeur sur un fichier (`vim`, `crontab -e`). */
  | {
      readonly type: 'open-editor';
      readonly path: string;
      /** Compte qui édite (root après `sudo vim`). */
      readonly user?: string;
      readonly onClose?: EditorHook;
    };

/**
 * Action à mener quand l'éditeur se ferme : `crontab -e` installe la table éditée
 * dans un fichier temporaire, comme le vrai `crontab`.
 */
export type EditorHook = {
  readonly kind: 'crontab';
  /** Compte dont on installe la table. */
  readonly user: string;
  /** Fichier temporaire édité. */
  readonly file: string;
  /** Contenu au moment de l'ouverture (pour « no changes made »). */
  readonly original: string;
};

/** Résultat d'une ligne de commande exécutée. */
export interface ExecResult<TState> {
  /** Nouvel état de la machine après la commande. */
  readonly state: TState;
  /** Texte écrit sur la sortie standard. */
  readonly stdout: string;
  /** Texte écrit sur la sortie d'erreur. */
  readonly stderr: string;
  /** Code de retour (0 = succès). */
  readonly exitCode: number;
  /** Effets particuliers pour l'interface (effacer l'écran, ouvrir vim…). */
  readonly effects?: readonly SimEffect[];
  /** Sorties standard et d'erreur entremêlées dans l'ordre d'écriture, si le simulateur le sait. */
  readonly output?: readonly { readonly stream: 'stdout' | 'stderr'; readonly text: string }[];
}

/** Identifiant d'un simulateur en ligne de commande. */
export type CommandLineSimulatorId = 'bash' | 'cmd' | 'powershell' | 'ios';

/** Un simulateur en mode ligne de commande (docs/03-simulateurs.md, interface commune). */
export interface CommandLineSimulator<TState> {
  readonly id: CommandLineSimulatorId;
  /** Invite affichée avant la saisie (ex. `hugo@srv-web01:~$`). */
  prompt(state: TState): string;
  /** Exécute une ligne complète saisie par le joueur. */
  exec(state: TState, line: string, ctx: SimContext): ExecResult<TState>;
  /** Propositions d'autocomplétion pour la saisie en cours. */
  complete(state: TState, partial: string): readonly string[];
  /** Message d'accueil affiché à l'ouverture de la session. */
  banner(state: TState, ctx: SimContext): string;
  /** Action à la fermeture de l'éditeur (installation de `crontab -e`), si le simulateur en a. */
  afterEdit?(state: TState, hook: EditorHook, ctx: SimContext): ExecResult<TState>;
}
