# 06 — Le monde et les cartes

## LabCorp

PME fictive de 120 personnes qui conçoit et fabrique des capteurs connectés. Trois sites :

- **Siège, Nantes** : bâtiment A (accueil, open space, atelier, salle de formation, salle serveurs, bureaux), bâtiment B (datacenter, NOC).
- **Agence commerciale, Rennes** : 15 personnes, un petit local réseau, reliée au siège par VPN. Fenêtres avec vue sur les toits rennais, pluie fréquente.
- **Domicile d'une télétravailleuse** (Vitré) et **console cloud** (zone stylisée hors du monde réel).

Les déplacements entre sites se font par un menu de transport (train TER Nantes ↔ Rennes, bus, ascenseur) avec une courte transition animée.

## Les 14 zones

| Id | Zone | Site | Ouverture | Ambiance et objets interactifs |
| --- | --- | --- | --- | --- |
| `dsi` | Bureau de la DSI | Siège A, 2e | Début | Planning mural, tableau des chapitres, bureau de Mme Garnier |
| `accueil` | Accueil et centre de services | Siège A, RDC | Ch. 1 | Comptoir, écran des tickets, imprimante à badges, file d'attente |
| `openspace` | Open space | Siège A, 1er | Ch. 1 | 24 postes, imprimantes, salle de pause, machine à café connectée |
| `formation` | Salle de formation | Siège A, 1er | Ch. 3 | PC du labo avec VMware Workstation, tableau blanc, le formateur ENI en visite |
| `atelier` | Atelier | Siège A, sous-sol | Ch. 3 | Établis, PC ouverts, armoire de stock, étiqueteuse, bac DEEE |
| `local-technique` | Local technique | Siège A, 1er | Ch. 2 | Baie de brassage, switchs, panneau de brassage, borne Wi-Fi |
| `salle-serveurs` | Salle serveurs | Siège A, sous-sol | Ch. 4 | Baies, onduleur, climatisation, console KVM, extincteur CO2 |
| `datacenter` | Datacenter | Siège B | Ch. 14 | Allées froides et chaudes, hyperviseurs, baie de stockage, robot de sauvegarde |
| `noc` | Salle de supervision | Siège B | Ch. 13 | Mur d'écrans, tableaux de bord, alertes qui clignotent |
| `soc` | SOC et bureau du RSSI | Siège A, 2e | Ch. 17 | Écrans d'alertes, pare-feu en façade, coffre à certificats |
| `reunion` | Salle de réunion | Siège A, 2e | Ch. 6 | Grande table, vidéoprojecteur, paperboard du cahier des charges |
| `agence-rennes` | Agence de Rennes | Rennes | Ch. 8 | Bureaux, petit local réseau, routeur, vue sur la ville, pluie |
| `teletravail` | Domicile d'une télétravailleuse | Vitré | Ch. 17 | Box, Wi-Fi, PC portable, chat qui marche sur le clavier |
| `cloud` | Console cloud | Abstrait | Ch. 15 | Plateformes flottantes, régions comme des îles, coûts affichés en nuages |

## Personnages principaux

| Id | Nom | Rôle | Zone | Chapitres | Trait |
| --- | --- | --- | --- | --- | --- |
| `garnier` | Mme Garnier | DSI | `dsi` | Tous (hub) | Exigeante, juste, phrases courtes |
| `martine` | Martine | Accueil | `accueil` | 1, 7 | Chaleureuse, débordée, adore les badges colorés |
| `ines` | Inès | Technicienne réseau | `local-technique` | 2, 8 | Passionnée de Cisco, tatouage du modèle OSI |
| `lucas` | Lucas | Technicien atelier | `atelier` | 3 | Calme, pédagogue, collectionne les vieux PC |
| `hugo` | Hugo | Administrateur systèmes | `salle-serveurs` | 4, 5 | Barbu, debianiste convaincu, humour sec |
| `sophie` | Sophie | Cheffe de projet | `reunion` | 6, 10 | Organisée, fan de diagrammes de Gantt |
| `elodie` | Élodie | Administratrice Windows | `salle-serveurs` | 9 | Rigoureuse, documentation impeccable |
| `yanis` | Yanis | Ingénieur automatisation | `formation` | 11, 12 | « Si tu le fais deux fois, scripte-le » |
| `camille` | Camille | Responsable exploitation | `noc` | 13, 18 | Calme olympien pendant les incidents |
| `theo` | Théo | Administrateur infrastructures | `datacenter` | 14, 15, 16 | Parle de ses VM comme de ses enfants |
| `leroy` | M. Leroy | RSSI | `soc` | 17 | Paranoïaque bienveillant |
| `formateur` | M. Kerboul | Formateur ENI (visiteur) | `formation` | Début de chaque chapitre | Rappelle le module de la semaine, lance des défis |
| `karim` | Karim | Commercial, agence de Rennes | `agence-rennes` | 2, 8, 17 | Toujours pressé, toujours en déplacement |
| `nadia` | Nadia | Ressources humaines | `openspace` | 3, 9 | Annonce les arrivées et départs (comptes à créer) |

Plus une vingtaine de figurants (utilisateurs) avec des routines : ils marchent entre leur poste, la machine à café et la salle de réunion selon l'heure.

## Conventions Tiled

- Tuiles de **16 × 16 px**, cartes de 40 × 25 tuiles maximum (640 × 400 px avant zoom).
- Un fichier par zone : `content/maps/<id>.tmj` (format JSON de Tiled).
- Tilesets externes partagés : `assets/tilesets/<nom>.tsj`.

**Calques (dans cet ordre)**

| Calque | Type | Rôle |
| --- | --- | --- |
| `sol` | Tuiles | Sols, tapis, marquages |
| `murs` | Tuiles | Murs et cloisons, avec propriété `collides: true` sur les tuiles |
| `mobilier-bas` | Tuiles | Mobilier sous le joueur |
| `mobilier-haut` | Tuiles | Mobilier au-dessus du joueur (haut des baies, plantes) |
| `lumieres` | Objets | Sources de lumière (`type: light`, `color`, `radius`, `intensity`, `flicker`) |
| `entites` | Objets | Points d'apparition PNJ, objets interactifs, portes |
| `zones` | Objets | Rectangles déclencheurs (entrée de pièce, ambiance sonore, zone de pluie) |

**Propriétés des objets du calque `entites`**

| `type` | Propriétés | Exemple |
| --- | --- | --- |
| `spawn` | `id` | `id: depart` |
| `npc` | `npcId`, `facing`, `routine` (optionnel) | `npcId: hugo`, `facing: left` |
| `door` | `to` (zone), `spawn` (point d'arrivée), `requires` (badge) | `to: salle-serveurs`, `requires: badge-serveurs` |
| `interactable` | `interactionId`, `prompt` | `interactionId: baie-a3`, `prompt: Examiner la baie` |
| `prop-anim` | `anim` | `anim: rack-leds`, `anim: screen-terminal` |

## Déplacements

- Déplacement libre en 8 directions, vitesse 80 px/s, collisions Arcade Physics sur les tuiles `collides`.
- Clic ou toucher : déplacement par pathfinding (A* sur grille, librairie maison testée) jusqu'à la cible ; si la cible est un PNJ, arrêt à côté et interaction.
- Interaction contextuelle : une bulle « E / Toucher » apparaît près d'un élément interactif.
- Course avec Maj (×1,6).

## Transitions

- Porte : fondu pixelisé de 300 ms (shader `pixelate` de Phaser), son de porte, apparition au point `spawn`.
- Changement de site : écran de transport (train qui traverse un paysage en parallaxe), 2 secondes, passable.

## Cycle jour/nuit et météo

- Teinte globale appliquée par un calque de couleur multiplicatif selon l'heure : matin chaud, après-midi neutre, soir orangé, nuit bleutée.
- Les sources de lumière du calque `lumieres` s'allument progressivement le soir.
- Météo par site, tirée chaque jour : Rennes a 45 % de chances de pluie (gouttes en particules sur les fenêtres et un bruit de fond).
