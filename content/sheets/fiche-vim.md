# Survivre à vim

- **Mode normal** (au démarrage) : les touches sont des commandes. **Échap** y ramène toujours.
- **Insertion** : `i` (avant le curseur), `a` (après), `o` (nouvelle ligne dessous), `O` (dessus), `A` (fin de ligne).
- **Enregistrer et quitter** : `:w` enregistrer, `:q` quitter, `:wq` (ou `:x`) les deux, `:q!` quitter **sans** enregistrer.
- **Éditer** : `x` supprime un caractère, `dd` une ligne, `dw` un mot, `cw` remplace un mot, `D` la fin de ligne, `yy` copie une ligne, `p` colle, `u` annule.
- **Se déplacer** : `h j k l` ou les flèches, `0` début de ligne, `$` fin, `gg` début du fichier, `G` fin, `/mot` cherche, `n` suivant.
- `:set number` affiche les numéros de ligne.

**À retenir** : avant d'éditer un fichier de configuration, en faire une copie - `cp fichier fichier.bak`.
