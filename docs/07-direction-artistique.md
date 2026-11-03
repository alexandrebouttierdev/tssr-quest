# 07 — Direction artistique

## Intention

Du **pixel art moderne** : la lisibilité et le charme des sprites 16 px, avec les techniques de rendu actuelles (lumières dynamiques, bloom léger, particules, animations fluides de l'interface). Références d'ambiance : *Eastward*, *Stardew Valley*, *A Short Hike*, *Hyper Light Drifter* pour la lumière. Le monde de l'informatique d'entreprise devient chaleureux et vivant : LED, écrans qui scintillent, câbles colorés, néons du NOC.

## Résolution et rendu

- Résolution logique : environ **320 × 180 px** (≈ 20 × 11 tuiles), zoomée en nombre entier (×4 en 720p, ×6 en 1080p) selon l'écran. La largeur logique s'adapte à la fenêtre pour la remplir sans bandes noires (`src/platform/viewport.ts`). *Révisé le 3 novembre 2026 : à 480 × 270, toute la salle tenait à l'écran et les personnages étaient trop petits.*
- `pixelArt: true`, `roundPixels: true` dans la config Phaser : aucun flou.
- Caméra qui suit le joueur avec un lissage (`lerp 0.12`) et une zone morte, sans jamais sortir de la carte.
- L'interface React n'est pas pixelisée à la même échelle : elle utilise une police pixel nette, rendue en CSS à taille entière, pour rester lisible sur mobile.

## Palette

Une palette maîtresse de 32 couleurs (à finaliser dans `assets/palette.gpl`), construite autour de quatre familles :

| Famille | Usage | Exemples |
| --- | --- | --- |
| Neutres froids | Murs, sols techniques, baies | `#0e1116` `#1b2129` `#2a323d` `#3a4552` `#556273` `#7d8a9a` |
| Bois et tissus chauds | Bureaux, mobilier, peaux, cheveux | `#6b4a33` `#8f6644` `#b07a52` `#f0c39b` `#d39a72` |
| Accents « métier » | LED, terminaux, statuts | vert LED `#2fbf71`, ambre `#f2b54a`, cyan `#5fb6e0`, rouge alerte `#e0524a` |
| Végétal et extérieur | Plantes, ciel, pluie | `#2f7a45` `#5cb860` `#2f6fb0` `#a8e4f5` |

Règle : les accents ne servent qu'à ce qui est interactif ou porteur d'information (LED d'état, écran, porte ouverte). Le décor reste dans les neutres et les bois.

## Personnages

- Sprites de **16 × 24 px**, contour sombre d'un pixel, ombre portée en ellipse.
- Animations : repos (respiration, 2 images), marche 4 directions (4 images), course (6 images), interaction (taper au clavier, 3 images), réaction (surprise, contentement).
- Les PNJ principaux ont un **portrait** de 48 × 48 px pour les dialogues, avec 3 expressions (neutre, content, inquiet).
- Le joueur est personnalisable : sprites découpés en calques (corps, tenue, cheveux) recolorés à la volée par une palette indexée.

## Lumière

C'est ce qui rend le pixel art « moderne ».

- **Pipeline Light2D de Phaser** sur les calques de décor, avec des normal maps simples générées pour les murs et les baies (optionnel en phase 1, prévu dès la phase 2).
- Sources de lumière posées dans Tiled : plafonniers, écrans, LED des baies, néons du NOC, lampes de bureau.
- LED de baies : petits sprites additifs qui clignotent selon des motifs différents (activité disque, lien réseau, alarme).
- **Bloom léger** (postFX `bloom` de Phaser 3.60+) sur les éléments émissifs seulement, désactivable dans les options.
- Vignettage discret dans les zones sombres (salle serveurs, datacenter la nuit).
- Événement « panne de courant » (chapitre 5 ou quête) : seules les LED de l'onduleur et les lampes de secours restent allumées.

## Particules et ambiance

| Effet | Où | Détail |
| --- | --- | --- |
| Poussière en suspension | Salle serveurs, atelier | Points lents, alpha faible, dans le flux de la clim |
| Flux d'air froid | Allées froides du datacenter | Traînées bleutées montant du sol perforé |
| Vapeur | Tasses de café, machine à café | Petites volutes |
| Pluie | Fenêtres de l'agence de Rennes | Gouttes qui glissent, éclaboussures au sol à l'extérieur |
| Étincelles | Erreur de câblage | Courtes, avec son grésillant |
| Confettis pixel | Montée de niveau, badge | Couleurs de la palette |
| Paquets réseau | Mini-jeu schéma réseau | Petits carrés qui voyagent le long des câbles |

## Animations du monde

- Écrans des postes : boucles différentes (code qui défile, tableur, visio, écran de veille LabCorp).
- Ventilateurs, onduleur qui bipe, imprimante qui sort une feuille.
- PNJ en routine : se déplacent, s'assoient, tapent, boivent un café, discutent par deux (bulles « … »).
- Le joueur qui reste immobile 20 s sort son téléphone.

## Animations de l'interface

- Ouverture de fenêtre : échelle 0,96 → 1 et fondu en 160 ms, courbe `easeOutCubic`.
- Texte de dialogue : apparition progressive (35 caractères/s par défaut, réglable), son de « voix » court par PNJ (bip à hauteur variable).
- Barre d'XP : remplissage animé, chiffres qui défilent, éclat lumineux au gain.
- Notifications : glissent depuis le bas, empilables, disparaissent après 4 s.
- Objectifs de mission : la case se coche avec un petit rebond et un son.
- Respect de `prefers-reduced-motion` : animations réduites à des fondus.

Bibliothèque recommandée côté React : **Motion** (`motion/react`) pour les transitions, ou CSS pur pour les cas simples.

## Typographie

| Usage | Police | Remarque |
| --- | --- | --- |
| Titres, HUD, noms | Police pixel (ex. *m6x11* de Daniel Linssen, ou *Pixelify Sans* sur Google Fonts) | Licence à vérifier avant usage public |
| Dialogues et textes longs | Police pixel lisible (ex. *m5x7*) ou *Atkinson Hyperlegible* en option accessibilité | Taille réglable |
| Terminaux | *JetBrains Mono* ou *IBM Plex Mono* | Monospace vectorielle pour la lisibilité des commandes |

## Son

- **Effets** (≈ 40) : pas sur moquette et sur sol technique, portes, clic clavier, bip de ticket, réussite, erreur, montée de niveau, ventilation, onduleur, pluie, voix de PNJ.
- **Musique** : une boucle calme par type de lieu (bureaux, technique, datacenter et NOC, agence, épreuve, finale). Style lo-fi chiptune.
- Gestion : mixage par catégories (musique, effets, ambiance, voix), fondu enchaîné entre zones, coupure de la musique dans les terminaux en option.
- Sources : effets générés (jsfxr ou synthèse WebAudio maison) et musiques sous licence CC0 / CC-BY, créditées dans `CREDITS.md`.

## Écrans clés à soigner pour la communication

1. Écran titre : LabCorp de nuit, la salle serveurs qui clignote derrière une vitre, la pluie, le logo TSSR Quest.
2. La salle serveurs avec lumière dynamique et poussière.
3. Un terminal en pleine mission, objectifs qui se cochent.
4. La montée de niveau.
5. Le NOC en pleine alerte, lumières rouges.

Ces écrans servent de vitrine : ils sont faits tôt et soignés en priorité (voir `14-communication.md`).
