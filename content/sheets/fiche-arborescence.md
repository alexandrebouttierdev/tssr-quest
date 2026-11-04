# L'arborescence Linux (FHS)

Tout part de la racine `/`. Pas de lettres de lecteur : les disques sont « montés » dans l'arbre.

| Dossier                 | Contenu                                                           |
| ----------------------- | ----------------------------------------------------------------- |
| `/etc`                  | Configuration du système et des services                          |
| `/home`                 | Dossiers personnels des utilisateurs                              |
| `/root`                 | Dossier personnel de root                                         |
| `/var`                  | Données variables : `/var/log` (journaux), `/var/www` (sites web) |
| `/tmp`                  | Fichiers temporaires, vidés au redémarrage                        |
| `/usr/bin`, `/usr/sbin` | Programmes (`sbin` : administration)                              |
| `/usr/local`            | Ce que l'on installe soi-même, hors paquets                       |
| `/dev`                  | Périphériques (`/dev/sda`)                                        |
| `/proc`, `/sys`         | Informations du noyau, générées à la volée                        |
| `/srv`                  | Données servies (partages, sites)                                 |

**À retenir** : un fichier dont le nom commence par un point est caché ; `ls -a` le montre.
