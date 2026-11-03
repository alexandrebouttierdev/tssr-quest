# 08 — Interface, HUD et fenêtres

Toute l'interface est en **React**, montée dans une couche HTML au-dessus du canvas Phaser. Elle lit l'état du jeu dans le store Zustand et envoie ses actions au moteur (jamais directement à Phaser).

## Couches d'affichage

```
┌──────────────────────────────────────────────┐
│  Canvas Phaser (monde)                        │  z 0
│  ┌──────────────────────────────────────────┐ │
│  │ HUD React (pointer-events: none sauf     │ │  z 10
│  │ boutons)                                 │ │
│  ├──────────────────────────────────────────┤ │
│  │ Dialogue (bas de l'écran)                │ │  z 20
│  ├──────────────────────────────────────────┤ │
│  │ Fenêtre de mission (terminal, AD, GLPI…) │ │  z 30
│  ├──────────────────────────────────────────┤ │
│  │ Menus plein écran (journal, inventaire…) │ │  z 40
│  ├──────────────────────────────────────────┤ │
│  │ Notifications, montée de niveau          │ │  z 50
│  └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘
```

Quand une fenêtre de mission ou un menu est ouvert, l'entrée clavier du monde est suspendue (`input.mode = "ui"` dans le store).

## Design system

Palette et jetons dans `src/ui/styles/tokens.css` : fond `#111820`, panneaux `#1B2633`, surfaces `#29394A`, accent cyan `#5FB6E0`, succès `#2FBF71`, avertissement `#F2B54A`, erreur `#E0524A`. Police pixel (Pixelify Sans) pour les éléments décoratifs (nom des personnages, logo), Atkinson Hyperlegible pour l'interface et les dialogues, JetBrains Mono pour les terminaux. Panneaux translucides à bordure fine, rayons de 8 à 12 px, ombres douces ; pas de glow ni de bordures épaisses. Boutons et touches partagés (`.btn`, `.btn-primary`, `.kbd`) dans `global.css`. Animations par `motion`, coupées par la réduction des animations.

## HUD d'exploration

*Version de la refonte : haut gauche portrait pixel, prénom, niveau, grade et XP (gain « +N XP » animé) ; haut droite heure, jour, tickets ouverts, alertes (calculés par `engine/tickets/ticket-board.ts`) ; bas gauche objectif actif (mission en cours avec étape et objectifs cochés, sinon ticket le plus urgent et le collègue à aller voir) ; bas centre invite d'interaction, doublée d'une bulle « E » au-dessus du PNJ. La mini-carte reste à faire.*

| Position | Élément | Détails |
| --- | --- | --- |
| Haut gauche | Carte joueur | Portrait, prénom, niveau, titre de poste, barre d'XP animée |
| Haut droite | Horloge et tickets | Heure de jeu, jour, météo, nombre de tickets ouverts, pastille rouge si SLA proche |
| Bas droite | Mini-carte | Zone courante, PNJ avec « ! » (mission dispo) ou « ? » (à revoir), sorties |
| Bas centre | Invite d'interaction | « E — Parler à Hugo » / bouton tactile |
| Bas gauche | Objectif suivi | Prochaine étape de la quête épinglée |
| Bas | Notifications | Toasts empilés |

Sur mobile : joystick virtuel à gauche, bouton d'action à droite, bouton menu en haut, mini-carte repliée.

## Dialogues

- Fenêtre en bas, compacte : grand portrait (48 × 48 agrandi ×3) qui déborde au-dessus, liseré coloré selon l'expression, nom (police pixel) et fonction, texte progressif avec curseur, indicateur « Suite · Espace ».
- Choix de réponse (2 à 4) numérotés, navigables aux flèches, aux chiffres, à la souris et au toucher, avec état de survol et de focus distinct.
- Un choix peut porter des effets : réputation, drapeau de quête, ouverture de mission, objet donné.
- Historique des répliques accessible (touche L) pour relire.
- Format des dialogues : voir `04-moteur-missions.md`.

## Menu principal (Échap / bouton menu)

| Onglet | Contenu |
| --- | --- |
| Journal | Quêtes principales et secondaires, étapes, PNJ à aller voir, quête épinglée |
| Tickets | Vue inspirée d'un outil de ticketing : numéro, demandeur, priorité, statut, SLA |
| Compétences | 8 jauges, paliers, avantages débloqués |
| Inventaire | Grille d'objets avec description, outils requis par les missions en cours |
| Fiches | Antisèches débloquées, recherche plein texte, favoris |
| Badges | Badges de chapitre, notes des épreuves, partage en image |
| Carte | Plan des sites, zones verrouillées, voyage rapide vers une zone déjà visitée |
| Options | Volume par catégorie, vitesse du texte, taille du texte, police lisible, contrastes, animations réduites, difficulté, sauvegardes |

## Fenêtres de mission

Une **fenêtre de mission** encadre toujours le simulateur :

```
┌─ Ticket #2046 · L'intranet est tombé · Critique ───────────── ✕ ┐
│ Objectifs                    │                                  │
│ [x] État du service          │   << composant du simulateur >>  │
│ [ ] Espace disque            │   terminal, console AD,          │
│ [ ] Libérer /var             │   schéma réseau, GLPI…           │
│ [ ] Relancer Apache          │                                  │
│                              │                                  │
│ [Indice] [Fiche] [Quitter]   │                                  │
└──────────────────────────────┴──────────────────────────────────┘
```

Composants de simulateur (un par type, voir `03-simulateurs.md`) :

| Composant | Rendu |
| --- | --- |
| `<Terminal>` | Bash, CMD, PowerShell, Cisco IOS : sortie défilante, invite, historique, autocomplétion, barre de touches rapides sur mobile (Tab, ↑, Ctrl+C, `|`, `-`, `/`) |
| `<VimEditor>` | Éditeur modal minimal (normal, insertion, commande) |
| `<NetworkDiagram>` | Canevas SVG : équipements à placer, câbles à tirer, IP et VLAN à saisir, animation des paquets au test |
| `<PatchPanel>` | Baie de brassage : glisser des cordons entre ports |
| `<DirectoryConsole>` | Arborescence AD, propriétés de comptes, groupes, liens GPO |
| `<TicketDesk>` | Liste de tickets, fiche ticket, catégorisation, suivi, clôture |
| `<VirtualizationConsole>` | Inventaire hôtes et VM, assistants de création, vSwitch, datastores |
| `<FlowMatrix>` | Tableau de règles de pare-feu à remplir et ordonner |
| `<BackupPlanner>` | Calendrier de jobs, chaîne de sauvegardes, assistant de restauration |
| `<Quiz>`, `<Ordering>`, `<FreeInput>` | Étapes simples |

Les fenêtres reprennent l'esprit des outils réels sans copier leurs interfaces : couleurs et logos propres à TSSR Quest.

## Accessibilité

- Navigation complète au clavier, focus visible, ordre logique.
- Contrastes AA, mode contraste élevé.
- Taille du texte réglable (3 niveaux), police lisible en option.
- Vitesse du texte réglable, texte instantané possible.
- Animations réduites (`prefers-reduced-motion` + option).
- Sous-titres pour tous les sons porteurs d'information (« Bip : nouveau ticket »).
- Lecteurs d'écran : dialogues et objectifs dans des régions `aria-live`.

## Mobile

- Jouable de bout en bout, mais l'ordinateur est conseillé pour les terminaux.
- Barre de touches rapides au-dessus du clavier virtuel.
- Fenêtres de mission en plein écran, objectifs repliables en haut.
- Orientation paysage conseillée pour l'exploration, portrait accepté pour les fenêtres.
