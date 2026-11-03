/**
 * Textes de l'interface, en français (règle 3 de CLAUDE.md : aucun texte joueur dans
 * la logique). Les fonctions reçoivent les valeurs à insérer.
 */
import type { FeedbackCode } from '@core/store/mission-run.slice';
import type { TicketPriority } from '@core/model';

/** Titres de poste par niveau (docs/01, « XP et niveaux »). */
export const LEVEL_TITLES: readonly string[] = [
  'Stagiaire',
  'Technicien·ne support N1',
  'Technicien·ne support N2',
  'Technicien·ne de proximité',
  'Technicien·ne systèmes',
  'Technicien·ne réseau',
  'Administrateur·rice systèmes et réseaux',
  'Administrateur·rice infrastructures',
  'TSSR confirmé·e',
  'Référent·e technique',
];

/** Libellés des priorités de ticket. */
export const PRIORITY_LABELS: Readonly<Record<TicketPriority, string>> = {
  basse: 'Basse',
  normale: 'Normale',
  haute: 'Haute',
  critique: 'Critique',
};

/** Retours génériques du moteur. */
export const FEEDBACK_TEXT: Readonly<Record<FeedbackCode, string>> = {
  correct: 'Bonne réponse !',
  incorrect: "Ce n'est pas ça. Relis la question, ou demande un indice.",
  'step-complete': 'Tous les objectifs sont atteints.',
  'session-kept-open': 'La session reste ouverte : utilise « Quitter » pour sortir de la mission.',
};

/** Textes de l'interface. */
export const STRINGS = {
  appTitle: 'TSSR Quest',
  title: {
    tagline: 'Le RPG du technicien supérieur systèmes et réseaux',
    company: 'LabCorp · siège régional · 23 h 47',
    newGame: 'Nouvelle partie',
    continue: 'Continuer',
    menu: 'Menu principal',
    nameLabel: 'Comment t’appelles-tu ?',
    namePlaceholder: 'Ton prénom',
    pronounsLabel: 'Comment parler de toi ?',
    pronouns: { il: 'il', elle: 'elle', iel: 'iel' },
    start: 'Commencer le stage',
    back: 'Retour',
    overwrite: 'Ta partie en cours sera remplacée.',
    controlsTitle: 'Contrôles',
    controls: [
      ['←↑↓→ ou ZQSD', 'se déplacer'],
      ['Maj', 'courir'],
      ['E ou Entrée', 'parler, interagir'],
      ['Clic', 'aller à un endroit'],
    ],
    footer:
      'Fan-game pédagogique · aucune affiliation avec un éditeur ou un organisme de formation',
  },
  controlsHint: '←↑↓→ / ZQSD : se déplacer · Maj : courir · E : parler',
  loading: 'Chargement de LabCorp…',
  contentMissing:
    'Le contenu du jeu est introuvable. Lance « npm run content:build » puis recharge la page.',
  hud: {
    level: (level: number) => `Niv. ${level}`,
    xp: (current: number, needed: number) =>
      needed > 0 ? `${current} / ${needed} XP` : 'XP maximale',
    playerFallback: 'Apprenant·e',
    interact: (name: string) => `Parler à ${name}`,
    interactKey: 'E',
    mission: (title: string) => `Mission : ${title}`,
  },
  dialogue: {
    next: 'Suite',
    region: 'Dialogue',
    choices: 'Réponses possibles',
  },
  mission: {
    ticket: (n: number) => `Ticket #${n}`,
    objectives: 'Objectifs',
    hint: 'Indice',
    hintsLeft: (left: number) => (left > 0 ? `(${left} restant${left > 1 ? 's' : ''})` : '(aucun)'),
    hints: 'Indices',
    sheet: 'Fiche',
    quit: 'Quitter',
    quitConfirm:
      'Quitter la mission ? Tu pourras la reprendre depuis le début avec le même collègue.',
    continue: 'Continuer',
    finish: 'Terminer la mission',
    step: (index: number, count: number) => `Étape ${index + 1} sur ${count}`,
    objectiveDone: 'atteint',
    objectiveTodo: 'à faire',
    validate: 'Valider',
    answer: 'Ta réponse',
    moveUp: 'Monter',
    moveDown: 'Descendre',
    dialogueStep: 'Écoute ton interlocuteur…',
  },
  terminal: {
    label: 'Commande',
    password: 'Mot de passe (saisie masquée)',
    output: 'Sortie du terminal',
    welcome: 'Tape « aide » pour voir les commandes disponibles.',
    keys: 'Touches rapides',
    tab: 'Tab',
    up: '↑',
    ctrlC: 'Ctrl+C',
  },
  editor: {
    label: (file: string) => `Éditeur vim : ${file}`,
    keys: "Touches de l'éditeur",
    escape: 'Échap',
    hint: 'vim : « i » pour écrire, Échap puis « :wq » pour enregistrer et quitter.',
  },
  sheets: {
    title: 'Fiche « À retenir »',
    close: 'Fermer',
  },
  notifications: {
    region: 'Notifications',
    missionDone: (xp: number) => `Mission terminée : +${xp} XP`,
    levelUp: (level: number, title: string) => `Niveau ${level} ! Tu es maintenant ${title}.`,
    dismiss: 'Fermer la notification',
  },
} as const;

/**
 * Titre de poste d'un niveau.
 *
 * @param level - Niveau de 1 à 10.
 * @returns Le titre affiché dans le HUD.
 */
export function levelTitle(level: number): string {
  return LEVEL_TITLES[Math.min(LEVEL_TITLES.length, Math.max(1, level)) - 1] ?? '';
}
