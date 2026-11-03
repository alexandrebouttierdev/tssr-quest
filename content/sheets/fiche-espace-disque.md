# Trouver ce qui remplit un disque

- `df -h` : occupation de chaque système de fichiers (colonne Uti%).
- `du -sh /var/*` : taille de chaque dossier, pour descendre vers le coupable.
- `ls -lh /var/log` : taille des journaux, lisible.
- `sudo rm fichier` : supprimer (définitif, pas de corbeille).

**Prévenir** :

- `logrotate` compresse et purge les anciens journaux chaque jour.
- Une alerte de supervision à 80 % prévient avant la panne.

**Attention** : on ne supprime jamais un journal sans savoir ce qu'il contient ni pourquoi il a grossi.
