# Le terminal et le shell Bash

- **Syntaxe** : `commande -options arguments` - par exemple `ls -l /etc`. Options courtes (`-l`, combinables : `-la`) ou longues (`--all`).
- **L'invite** `stagiaire@deb-formation:~$` : compte, machine, dossier courant (`~` = dossier personnel), `$` utilisateur ou `#` root.
- **Se repérer** : `whoami` (qui), `hostname` (quelle machine), `pwd` (où), `uname -r` (version du noyau), `who` (qui est connecté).
- **Terminaux** : `tty1` est la console physique, `pts/0` une session distante (SSH).
- **SSH** : `ssh compte@machine` ouvre une session chiffrée à distance. Jamais telnet.
- **Confort** : Tab complète, flèche haut rappelle les commandes, Ctrl+C interrompt, `clear` efface l'écran.

**À retenir** : Linux respecte la casse - `Rapport.txt` et `rapport.txt` sont deux fichiers différents.
