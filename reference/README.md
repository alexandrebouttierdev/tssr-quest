# Référence — prototypes de la phase de conception

Ces fichiers viennent de la phase de conception. Ils servent de **référence visuelle et fonctionnelle** ; ils ne font pas partie du code du jeu et ne doivent pas être importés tels quels.

| Fichier | Contenu |
| --- | --- |
| `prototypes/salle-serveurs-pixel.html` | Échantillon retenu : salle serveurs en pixel art, déplacement, dialogue avec Hugo, mission terminal Linux. S'ouvre directement dans un navigateur. |
| `prototypes/dialogue-et-terminal.js` / `.css` | Code de la boîte de dialogue et du terminal du prototype (logique de commandes à réécrire proprement dans `src/sims/bash`). |
| `prototypes/premier-prototype-7-missions.html` | Tout premier prototype : 7 missions (support, DHCP, AD, atelier, adressage, Linux, sécurité) sur une carte canvas. Utile pour le contenu des QCM. |
| `sprites/tileset_salle_serveurs.png` | Tileset 16 px : sols, murs, baies (2 états de LED), poste, armoire réseau, porte, plante, climatisation, extincteur, bande de sécurité. |
| `sprites/personnage_technicien.png` | Spritesheet 64 × 96 : 4 directions (bas, gauche, droite, haut) × 4 images de 16 × 24. |
| `sprites/*_x6.png` | Les mêmes, agrandis ×6 pour la lecture. |
| `sprites/generateur_sprites.py` | Script Python (Pillow) qui a généré ces sprites : base du futur générateur Node d'`assets/generators/`. |

Ordre des tuiles du tileset (8 colonnes × 2 lignes, index de 0 à 15) :

| Index | Tuile | Index | Tuile |
| --- | --- | --- | --- |
| 0 | Sol technique | 8 | Poste de travail (écran 1) |
| 1 | Sol perforé d'allée froide | 9 | Poste de travail (écran 2, curseur) |
| 2 | Dessus de mur | 10 | Armoire réseau avec switch |
| 3 | Face de mur | 11 | Porte |
| 4 | Haut de baie (LED état A) | 12 | Plante |
| 5 | Bas de baie (LED état A) | 13 | Climatisation |
| 6 | Haut de baie (LED état B) | 14 | Mur avec extincteur |
| 7 | Bas de baie (LED état B) | 15 | Sol avec bande de sécurité |
