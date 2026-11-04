# Installer Debian sur un serveur

1. Langue, pays, clavier.
2. Réseau : nom de la machine (`srv-web01`), domaine (`lab.local`).
3. Mot de passe de **root** et premier utilisateur.
4. **Partitionnement** : `/`, `/var` séparé (journaux, sites, bases), swap ; LVM pour pouvoir agrandir.
5. Système de base.
6. **tasksel** : serveur SSH et utilitaires usuels, **pas** d'environnement de bureau.
7. GRUB sur le disque de démarrage.
8. Redémarrage, puis `sudo apt update && sudo apt upgrade`.

**À retenir** : noter la configuration (adresse, partitions, comptes) dans la documentation du parc, et le mot de passe root dans le coffre-fort de mots de passe.
