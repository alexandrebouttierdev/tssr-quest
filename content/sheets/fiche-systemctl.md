# Diagnostiquer un service avec systemctl

**Réflexe** : lire l'état AVANT de redémarrer.

- `systemctl status apache2` : état (active, inactive, failed), PID, et les dernières lignes du journal.
- `journalctl -u apache2` : tout le journal du service ; `-xe` ajoute des explications et va à la fin.
- `sudo systemctl restart apache2` : redémarrer (il faut les droits root).
- `sudo systemctl enable apache2` : démarrer automatiquement au boot.

**À retenir** : un service en échec affiche toujours sa raison (disque plein, port occupé, fichier de configuration invalide). La lire, c'est déjà la moitié du dépannage.
