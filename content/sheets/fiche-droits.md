# Droits sous Linux

`-rw-r-----  1 julie compta` : type, droits du **propriétaire**, du **groupe**, des **autres**.

|       | Fichier  | Dossier                 |
| ----- | -------- | ----------------------- |
| r (4) | lire     | lister                  |
| w (2) | modifier | créer, supprimer dedans |
| x (1) | exécuter | entrer (cd)             |

- `chmod 640 f`, `chmod u+x script.sh`, `chmod -R g+w dossier`.
- `chown julie:compta f`, `chgrp -R compta dossier`.
- **setgid** sur un dossier (`chmod 2770`) : les nouveaux fichiers prennent le groupe du dossier.
- **sticky bit** (`chmod 1777`, comme `/tmp`) : chacun ne supprime que ses propres fichiers.
- **umask** : droits retirés à la création ; fichier 666 et dossier 777 moins le umask (022 → 644 et 755).

**À retenir** : jamais de 777 sur un partage. Un groupe par service, le setgid, et le moins de droits possible.
