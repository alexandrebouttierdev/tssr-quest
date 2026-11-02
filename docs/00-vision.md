# 00 — Vision

## Le pitch

> **TSSR Quest** : ton alternance TSSR en jeu vidéo. Prends des tickets, tape de vraies commandes, sauve l'intranet, et deviens le référent technique de LabCorp.

Un RPG 2D en pixel art moderne, jouable gratuitement dans le navigateur, sur ordinateur comme sur mobile. Chaque notion du titre TSSR devient une mission concrète, jouée dans un simulateur fidèle : on ne coche pas une case « je connais chmod », on répare un serveur qui refuse de démarrer.

## Le scénario

Tu es apprenant·e de la promo TSSR de l'ENI et tu commences ton alternance chez **LabCorp**, une PME de 120 personnes qui fabrique des capteurs connectés. Le siège est à Nantes, l'agence commerciale à Rennes, le datacenter dans le bâtiment B du siège.

Le service informatique est en sous-effectif depuis le départ de l'ancien administrateur, « Gégé », qui a laissé derrière lui des mots de passe sur des post-its, un serveur Debian jamais mis à jour et un switch configuré à la main en 2014. Mme Garnier, la DSI, compte sur toi.

Au fil des 18 chapitres, au rythme de ta formation, tu passes de « stagiaire qui débouche l'imprimante » à « référent technique qui gère la nuit d'astreinte ». En fil rouge, une intrigue légère : qui a laissé une porte dérobée dans l'infrastructure de Gégé ? Elle se résout au chapitre de sécurité et se conclut pendant la finale.

## Pour qui

| Public | Ce qu'il y cherche |
| --- | --- |
| Apprenants TSSR (ENI et autres organismes) | Réviser chaque module en pratiquant, préparer l'examen |
| Personnes en reconversion qui hésitent | Découvrir le métier de façon concrète |
| Formateurs | Un support ludique à proposer en complément |
| Recruteurs et tuteurs d'alternance | Voir les compétences de l'auteur en action (portfolio) |

## Principes pédagogiques

1. **Faire, pas cocher.** Chaque notion se pratique dans un simulateur. Les QCM ne servent qu'à vérifier une compréhension après la pratique.
2. **Une mission = un ticket réaliste.** Un demandeur, un symptôme, un diagnostic, une résolution, une trace écrite.
3. **La méthode avant la réponse.** Le jeu récompense les bons réflexes : lire le statut avant de redémarrer, vérifier l'identité avant de réinitialiser un mot de passe, sauvegarder une configuration avant de la modifier.
4. **L'erreur n'est jamais punitive.** Elle coûte un bonus d'XP, jamais la progression. L'explication arrive toujours, avec la fiche correspondante.
5. **Plusieurs bonnes réponses sont acceptées.** La réussite se vérifie sur l'état du système simulé, pas sur le texte exact tapé.
6. **Au rythme de la formation.** Un chapitre par module ENI, dans le même ordre, pour réviser chaque semaine ce qui vient d'être vu en cours.
7. **Rejouable.** Les missions terminées restent accessibles en révision, avec des variantes tirées au hasard (adresses, noms, pannes).
8. **Exact avant d'être drôle.** L'humour est bienvenu dans les dialogues, jamais dans les sorties de commandes.

## Ce qui rend le jeu unique

- De **vrais simulateurs à état** : un Linux où `rm` supprime vraiment un fichier du système virtuel, un switch dont la table MAC se remplit, un AD où l'appartenance aux groupes calcule les droits effectifs.
- Un **monde vivant** en pixel art moderne : lumières dynamiques, LED qui clignotent, pluie sur Rennes, collègues qui circulent, journée qui avance.
- Une **campagne alignée sur un vrai programme de formation**, utilisable par toute une promo.
- Un **projet ouvert** : code source public, missions en YAML que d'autres apprenants peuvent proposer.

## Ambition et périmètre

C'est un gros jeu : 18 chapitres, environ 150 missions, 14 zones, une dizaine de simulateurs. Pour qu'il existe vraiment, il est construit en **tranches jouables** : chaque jalon de la roadmap produit une version publiable. La première, la tranche Linux, doit à elle seule donner envie d'y jouer et de la partager.

## Indicateurs de réussite

- Une première version publique jouable avant fin décembre 2026.
- Au moins 10 apprenants de la promo qui terminent la tranche Linux et donnent un retour.
- Un post LinkedIn de lancement qui dépasse 10 000 vues.
- Le projet cité en entretien de stage, démo à l'appui.
