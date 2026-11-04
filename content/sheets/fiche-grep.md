# grep et les expressions régulières

- `grep motif fichier` : les lignes qui contiennent le motif. Guillemets si le motif contient des espaces.
- Options : `-i` (ignorer la casse), `-c` (compter), `-v` (inverser), `-n` (numéros de ligne), `-r` (dans un dossier), `-o` (seulement la partie trouvée), `-w` (mot entier).
- **Expressions régulières** : `^` début de ligne, `$` fin, `.` un caractère, `*` zéro ou plus, `[0-9]` un chiffre, `[^a]` tout sauf a.
- **Étendues** (`grep -E` ou `egrep`) : `a|b` (l'un ou l'autre), `+` (un ou plus), `?` (facultatif), `( )` groupes, `{3}` répétitions.
- Compter les occurrences : `grep -oE "[0-9]+(\.[0-9]+){3}" fichier | sort | uniq -c | sort -rn`.

**À retenir** : `grep "Failed password" /var/log/auth.log` - les tentatives de connexion SSH ratées.
