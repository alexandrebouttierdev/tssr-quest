# Gérer les paquets avec apt et dpkg

- `sudo apt update` : télécharge la liste des paquets des dépôts.
- `apt list --upgradable` : ce qui peut être mis à jour. `sudo apt upgrade` : appliquer.
- `sudo apt install paquet` ; `sudo apt remove paquet` (garde la configuration) ; `sudo apt purge paquet` (supprime tout) ; `sudo apt autoremove`.
- `apt search mot`, `apt show paquet`.
- `dpkg -l` : paquets installés (`ii` = installé) ; `dpkg -L paquet` : ses fichiers ; `dpkg -S /chemin` : quel paquet fournit ce fichier.
- Installation interrompue : `sudo dpkg --configure -a`.
- **Dépôts** : `/etc/apt/sources.list` - `bookworm` (principal), `bookworm-updates`, `bookworm-security` (correctifs de sécurité).

**À retenir** : lire le message d'erreur d'apt - il donne souvent la commande à lancer.
