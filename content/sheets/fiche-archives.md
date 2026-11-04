# Archiver et compresser

- **Archiver** (regrouper) : `tar`. **Compresser** (réduire) : `gzip`. Les deux : `.tar.gz`.
- `tar czf archive.tar.gz dossier` : créer (c), compresser avec gzip (z), nom du fichier (f).
- `tar tzf archive.tar.gz` : lister le contenu sans extraire.
- `tar xzf archive.tar.gz -C /destination` : extraire dans un dossier existant.
- `gzip fichier` → `fichier.gz` (l'original est remplacé) ; `gunzip fichier.gz` ; `zcat fichier.gz` pour lire sans décompresser.
- `zip -r archive.zip dossier` et `unzip archive.zip` : pour échanger avec Windows.

**À retenir** : une sauvegarde n'existe que si l'on a déjà réussi à la restaurer.
