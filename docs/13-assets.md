# 13 — Assets

## Formats et conventions

| Type | Format | Taille | Emplacement |
| --- | --- | --- | --- |
| Tuiles | PNG indexé, tileset Tiled `.tsj` | 16 × 16 px | `public/tilesets/` |
| Personnages | Spritesheet PNG + atlas JSON (format Phaser) | Cadres de 16 × 24 px | `public/sprites/characters/` |
| Portraits | PNG | 48 × 48 px, 3 expressions | `public/sprites/portraits/` |
| Objets animés | Spritesheet PNG + atlas | Variable, multiple de 8 | `public/sprites/props/` |
| Icônes UI | PNG ou SVG pixel | 16 × 16 et 32 × 32 | `public/sprites/ui/` |
| Effets sonores | OGG + MP3 (repli Safari) | Mono, 44,1 kHz | `public/audio/sfx/` |
| Musiques | OGG + MP3 | Stéréo, boucles sans coupure | `public/audio/music/` |
| Ambiances | OGG | Boucles | `public/audio/ambience/` |
| Polices | WOFF2 | — | `public/fonts/` |

Nommage : `kebab-case`, préfixe par famille (`tile-`, `npc-`, `prop-`, `ui-`, `sfx-`, `mus-`, `amb-`).

## Inventaire

| Lot | Contenu | Quantité | Phase |
| --- | --- | --- | --- |
| Tilesets | Bureaux, technique, datacenter, agence, extérieur, maison, cloud | 7 jeux de 64 à 128 tuiles | 0 à 5 |
| Équipements IT | Baies (5 variantes), serveurs 1U/2U, switchs, routeurs, patch panel, onduleur, NAS, bornes Wi-Fi, écrans, imprimantes, PC ouverts, câbles | ≈ 60 objets, dont 25 animés | 0 à 5 |
| Mobilier | Bureaux, chaises, tables, armoires, plantes, machine à café, tableau blanc, vidéoprojecteur | ≈ 50 | 0 à 3 |
| Joueur | Corps, 8 tenues, 6 coiffures, recoloration par palette ; repos, marche, course, interaction, réactions | 1 système modulaire | 0 à 1 |
| PNJ principaux | 14 personnages, mêmes animations | 14 | 0 à 5 |
| Figurants | Variantes de couleurs et de coiffures | 20 | 1 à 3 |
| Portraits | 14 PNJ × 3 expressions | 42 | 1 à 5 |
| Effets visuels | Lumières (halos), poussière, vapeur, pluie, étincelles, confettis, paquets réseau | 10 systèmes | 1 à 3 |
| Interface | Cadres de fenêtres, boutons, onglets, jauges, icônes d'objets et de compétences, badges | ≈ 120 | 0 à 5 |
| Logo et écran titre | Logo TSSR Quest, illustration de fond animée | 2 | 1 |
| Sons | Pas (2 sols), portes, clavier, bips, réussite, erreur, niveau, ventilation, onduleur, pluie, voix de PNJ | ≈ 40 | 0 à 5 |
| Musiques | Bureaux, technique, datacenter et NOC, agence, épreuve, finale, titre | 7 boucles | 1 à 5 |

## Pipeline de production

1. **Génération par code** (Node, `assets/generators/`) pour les équipements IT, tuiles techniques, LED, écrans et variantes de couleur. C'est ainsi qu'ont été créés les premiers sprites de `reference/`. Les scripts dessinent pixel par pixel à partir d'une palette et de motifs ASCII, puis exportent des PNG et les atlas JSON.
2. **Retouche manuelle** dans Aseprite (ou LibreSprite, gratuit) pour les personnages et portraits : les sources `.aseprite` vont dans `assets/aseprite/`.
3. **Packs complémentaires** possibles pour les intérieurs génériques (par exemple les packs « Modern Interiors » et « Modern Office » de LimeZu sur itch.io), à condition que la licence autorise un usage public et gratuit, et en harmonisant la palette.
4. **Sons** : jsfxr pour les bips et effets courts, enregistrements libres de droits (Freesound, licence CC0) pour les ambiances.
5. **Musiques** : boucles sous licence CC0 ou CC-BY (OpenGameArt, Free Music Archive), ou composition chiptune.

Tout asset externe est listé dans `CREDITS.md` avec son auteur, sa source et sa licence. Aucun asset dont la licence interdit la redistribution dans un dépôt public.

## Points de vigilance

- Pas de logos ni d'interfaces copiés de Microsoft, Cisco, VMware, GLPI ou de l'ENI. Les équipements sont génériques (« switch 24 ports ») ; les noms de produits n'apparaissent que dans le texte pédagogique.
- Les polices pixel ont des licences variées : vérifier l'usage commercial et la redistribution avant d'intégrer.
- Budget poids : tilesets et sprites < 2 Mo au total, sons < 1,5 Mo, musiques chargées à la demande.
