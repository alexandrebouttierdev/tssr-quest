# Comptes et groupes

- `sudo useradd -m -s /bin/bash -G groupe nom` : créer (dossier personnel, shell, groupes). `adduser nom` : version interactive de Debian.
- `sudo passwd nom` : mot de passe ; `sudo chage -d 0 nom` : à changer à la prochaine connexion ; `chage -l nom` : vérifier.
- `sudo usermod -aG groupe nom` : ajouter à un groupe (**-a**, sinon il quitte les autres) ; `usermod -L` / `-U` : verrouiller, déverrouiller.
- `sudo groupadd groupe`, `groupdel`, `gpasswd -d nom groupe`.
- `sudo userdel -r nom` : supprimer avec son dossier.
- `id nom`, `groups nom`, `getent passwd nom`.
- Fichiers : `/etc/passwd` (comptes), `/etc/shadow` (mots de passe hachés, root seulement), `/etc/group`.
- **sudo** : membres du groupe `sudo` ; `sudo -l` liste ses droits.

**À retenir** : au départ d'un collaborateur - verrouiller tout de suite, vérifier (fichiers, tâches cron, clés SSH), supprimer ensuite.
