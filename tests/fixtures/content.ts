/**
 * Petit jeu de contenu valide pour les tests (un chapitre, une mission à trois étapes,
 * un PNJ et ses dialogues). Chaque test peut le modifier pour provoquer une erreur.
 */

/** Fichiers de contenu valides, indexés par chemin relatif à `content/`. */
export const VALID_CONTENT_FILES: Readonly<Record<string, string>> = {
  'chapters/05-test/chapter.yaml': `
id: test
number: 5
title: Chapitre de test
eniModule: Module de test
period: { from: "2026-11-09", to: "2026-11-20" }
zones: [salle]
mentor: hugo
missions: [test.panne, test.suite]
`,
  'chapters/05-test/panne.mission.yaml': `
id: test.panne
chapter: test
title: La panne
summary: Un service est en panne, il faut le relancer.
giver: hugo
zone: salle
ticket: { number: 1, priority: haute, requester: hugo, service: commercial }
rewards: { xp: 100, skills: { linux: 5 }, reputation: { commercial: 3 }, sheets: [fiche-a], items: [cle] }
dialogue: { intro: "hugo#intro", outro: "hugo#outro", abandon: "hugo#abandon" }
machines:
  srv:
    base: debian-server
    hostname: srv
    session: { user: hugo }
    users: [hugo]
    sudoers: [hugo]
    services: { apache2: { state: inactive } }
steps:
  - id: relance
    type: terminal
    sim: bash
    machine: srv
    goal: Relance le service web.
    objectives:
      - { id: actif, label: Service actif, when: { service: { name: apache2, state: active } } }
    hints: [Une piste, Une commande, La solution]
    solution: [sudo systemctl start apache2]
  - id: quiz
    type: choice
    question: Quelle commande lit l'état ?
    options:
      - { text: systemctl status, correct: true }
      - { text: rm -rf, feedback: Surtout pas. }
    explain: status affiche l'état.
  - id: saisie
    type: input
    question: Quel port écoute Apache ?
    answers: ["80"]
    normalize: [trim]
  - id: ordre
    type: ordering
    question: Remets les étapes dans l'ordre.
    items: [Lire, Corriger, Relancer]
recap: [Lire avant d'agir.]
`,
  'chapters/05-test/suite.mission.yaml': `
id: test.suite
chapter: test
title: La suite
summary: Une mission qui suit la première.
giver: hugo
zone: salle
requires: { missions: [test.panne] }
rewards: {}
dialogue: { intro: "hugo#intro", outro: "hugo#outro" }
steps:
  - id: q
    type: choice
    question: Prêt ?
    options: [{ text: Oui, correct: true }, { text: Non }]
recap: [Rien.]
`,
  'dialogues/hugo.dialogue.yaml': `
npc: hugo
nodes:
  intro:
    - say: Bonjour {prenom}, on a une panne.
      mood: inquiet
    - say: Tu veux un indice ?
      choices:
        - text: Oui
          then: [{ say: Lis le statut. }]
        - text: Non
          effects: [{ flag: confiance }]
          then: [{ say: Bien. }]
    - effects: [{ startStep: relance }]
  outro:
    - say: Merci !
      mood: content
    - if: { flag: confiance }
      say: Et sans indice.
    - say: À bientôt.
  abandon:
    - say: Reviens quand tu veux.
  default:
    - say: Toujours les journaux.
`,
  'npcs/hugo.npc.yaml': `
id: hugo
name: Hugo
role: Administrateur systèmes
zone: salle
description: Barbu et debianiste.
`,
  'zones/zones.yaml': `
- { id: salle, name: Salle serveurs, site: Siège, map: salle, opensAt: 0 }
`,
  'items/items.yaml': `
- { id: cle, name: Clé, category: outil, description: Une clé USB. }
`,
  'sheets/fiche-a.md': `# Fiche A

Le corps de la fiche.
`,
  'maps/salle.tmj': '{}',
};
