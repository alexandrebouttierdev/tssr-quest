# Manipuler fichiers et dossiers

- `mkdir -p a/b/c` : créer des dossiers (et leurs parents). `rmdir` : supprimer un dossier vide.
- `cp source destination` ; `cp -r dossier destination` pour un dossier ; `cp -a` garde droits et dates.
- `mv source destination` : déplacer ou renommer.
- `rm fichier` ; `rm -r dossier`. **Pas de corbeille** : ce qui est supprimé est perdu.
- `touch fichier` : créer un fichier vide.
- `ln -s cible lien` : lien symbolique (raccourci). `ls -l` affiche `lien -> cible`.
- **Chemins** : absolu (`/home/stagiaire/doc`), relatif au dossier courant (`doc`, `../autre`), `~` = dossier personnel, `.` = ici, `..` = parent.
- **Jokers** : `*` (n'importe quoi), `?` (un caractère), `[abc]` (un parmi) - `mv *.jpg photos/`.

**À retenir** : avant un `rm` avec joker, faire un `ls` avec le même joker pour voir ce qui sera supprimé.
