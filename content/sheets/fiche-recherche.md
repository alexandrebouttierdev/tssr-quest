# Retrouver un fichier ou une commande

- `find /dossier -name "motif"` : parcourt le disque en direct. Aussi `-iname` (sans casse), `-type f` ou `d`, `-size +100M`, `-mtime -7` (modifié il y a moins de 7 jours), `-user julie`.
- `locate motif` : instantané, mais cherche dans une **base** mise à jour chaque nuit. `sudo updatedb` la rafraîchit.
- `which tar` : où se trouve le programme lancé quand on tape `tar` (parcourt le PATH).
- `type cd` : primitive du shell, alias ou programme.

**À retenir** : `2>/dev/null` à la fin d'un `find` masque les messages « Permission non accordée » des dossiers interdits.
