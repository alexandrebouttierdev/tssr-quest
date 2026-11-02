# 14 — Communication et visibilité

Objectif : faire connaître TSSR Quest auprès de la communauté TSSR et IT, et montrer aux recruteurs ce que l'auteur sait faire, pour décrocher un **stage TSSR**.

## Positionnement

> « Je suis en formation TSSR à l'ENI. Pour réviser, j'ai créé un RPG où l'on apprend le métier en réparant de vrais serveurs. Il est gratuit, open source, et toute ma promo peut y jouer. »

Ce que le projet démontre à un recruteur :

- **Compétences systèmes et réseaux** : chaque simulateur prouve une compréhension fine de Linux, Windows, Cisco, AD, sécurité.
- **Compétences de développement** : architecture propre, TypeScript strict, tests, CI/CD, déploiement sur VPS.
- **Pédagogie et communication** : expliquer simplement, documenter, fédérer une promo.
- **Autonomie et persévérance** : un projet ambitieux mené en parallèle de la formation.

## Canaux

| Canal | Usage | Rythme |
| --- | --- | --- |
| LinkedIn (profil personnel) | Devlog, lancements, coulisses | 1 post toutes les 2 semaines, 1 post à chaque phase |
| GitHub | Code public, README illustré, issues ouvertes aux contributions de contenu | En continu |
| Site du jeu | Jouer, présentation, lien vers le dépôt et le profil LinkedIn | Mis à jour à chaque version |
| itch.io | Visibilité auprès des joueurs et créateurs indépendants | À chaque version |
| Promo ENI | Tests, retours, bouche-à-oreille | À chaque phase |

## Calendrier éditorial

| Moment | Sujet du post | Visuel |
| --- | --- | --- |
| Semaine 1 | « Je me lance dans un projet fou » : l'idée, le programme TSSR, la promesse | Capture du prototype |
| Toutes les 2 semaines | Devlog : une technique (simulateur Bash, moteur réseau, lumière), une difficulté, une leçon apprise | GIF de 10 s |
| Fin de phase 1 | Lancement de la tranche Linux : lien jouable, appel aux testeurs | Vidéo de 30 s |
| Après les retours | « Ce que 20 apprenants m'ont appris » : chiffres, retours, améliorations | Carrousel |
| Chaque phase | Nouveau chapitre disponible | GIF de la nouvelle zone |
| Version 1.0 | Lancement complet, remerciements, recherche de stage explicite | Bande-annonce de 60 s |

## Modèles de posts

**Annonce du projet**

> Je suis en reconversion vers le métier de technicien supérieur systèmes et réseaux (TSSR) à l'ENI.
>
> Pour réviser, j'ai eu une idée un peu folle : transformer tout le programme en jeu vidéo.
>
> TSSR Quest, c'est un RPG en pixel art où tu es en alternance chez LabCorp. Les collègues t'appellent à l'aide, et tu résous leurs tickets en tapant de vraies commandes : `systemctl`, `chmod`, `show vlan brief`, `New-ADUser`…
>
> 18 chapitres, un par module de ma formation. Le premier sort en décembre, gratuit et open source.
>
> Si tu es en formation TSSR, formateur ou admin sys, j'aimerais beaucoup ton avis. 👇
>
> #TSSR #Linux #AdminSys #Reconversion #GameDev #PixelArt

**Devlog technique**

> Devlog #3 de TSSR Quest : comment simuler un vrai Linux dans un navigateur ?
>
> Le piège aurait été de comparer le texte tapé à une réponse attendue. Sauf qu'en vrai, `chmod 640` et `chmod u=rw,g=r,o=` font la même chose.
>
> Alors j'ai codé une petite machine virtuelle : un système de fichiers avec de vrais droits, des services qui tombent en panne, des disques qui se remplissent. La mission ne vérifie pas ce que tu tapes, elle vérifie l'état du serveur.
>
> Résultat : 340 tests unitaires rien que pour le simulateur Bash. 🧪
>
> [GIF]

**Recherche de stage**

> TSSR Quest 1.0 est sorti. 18 chapitres, 150 missions, 6 mois de soirées.
>
> Ce projet m'a fait réviser tout le programme TSSR en profondeur… et maintenant je cherche un stage pour mettre tout ça en pratique sur une vraie infrastructure, à Rennes ou à distance.
>
> Si votre équipe cherche un·e stagiaire TSSR qui aime comprendre comment les choses marchent, écrivez-moi !

(Les chiffres sont à remplacer par les vrais au moment de publier.)

## Bonnes pratiques

- Chaque post : un visuel animé (GIF ou vidéo courte), une seule idée, un appel à l'action.
- Publier en semaine, en début de matinée ou à l'heure du déjeuner.
- Répondre à tous les commentaires dans la journée.
- Mentionner les personnes qui ont testé (avec leur accord).
- Écrire le premier commentaire avec le lien (pratique courante pour ne pas pénaliser la portée du post).
- Garder un ton humble et enthousiaste : on montre le chemin, pas seulement le résultat.

## L'ENI dans le projet

Le jeu fait référence à la formation TSSR de l'ENI (programme, rythme des modules, un formateur fictif en visite). Pour que ce soit une force et non un risque :

- Ne jamais utiliser le logo ni la charte graphique de l'ENI sans autorisation écrite.
- Garder la mention de non-affiliation du README et de l'écran de crédits.
- **Présenter le projet aux formateurs et au service communication de l'ENI avant le lancement public** : ils peuvent valider le contenu, autoriser les références et relayer le projet, ce qui multiplierait sa portée.
- Les personnages, dont le formateur, sont fictifs et ne doivent pas ressembler à des personnes réelles de l'école.

## Mentions légales du jeu

À afficher dans les crédits et sur le site :

> TSSR Quest est un projet personnel et pédagogique, gratuit et open source. Il n'est ni produit, ni validé, ni soutenu officiellement par l'ENI École Informatique ni par le ministère du Travail. LabCorp et ses personnages sont fictifs. Les marques citées appartiennent à leurs propriétaires et ne sont mentionnées qu'à des fins d'apprentissage. Le jeu n'enregistre aucune donnée personnelle : la sauvegarde reste dans le navigateur du joueur.

## Licences proposées

- **Code** : MIT, pour que d'autres apprenants puissent s'en inspirer.
- **Contenu** (missions, dialogues, fiches) et **assets originaux** : CC BY-NC 4.0, pour autoriser le partage et l'adaptation pédagogique sans usage commercial.

À confirmer avant le premier dépôt public.
