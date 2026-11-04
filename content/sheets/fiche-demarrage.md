# Le démarrage de Linux et systemd

**Séquence** : BIOS/UEFI → GRUB → noyau Linux → systemd (PID 1) → cible → services.

- **Cibles** : `multi-user.target` (serveur), `graphical.target` (bureau), `rescue.target` (maintenance). `systemctl get-default`, `sudo systemctl set-default multi-user.target`.
- **Services** : `start` (maintenant), `enable` (au démarrage), `enable --now` (les deux), `is-enabled`, `systemctl --failed`.
- **Journal** : `journalctl -b` (depuis le démarrage), `-p err` (erreurs seulement), `-u apache2` (un service).
- **/etc/fstab** : désigner les disques par `UUID=` ou `LABEL=` (`blkid`), jamais par `/dev/sdX`, qui change quand on ajoute ou retire un disque. `nofail` pour un disque non vital. Tester avec `sudo mount -a` avant de redémarrer.
- Une ligne de fstab fausse sans `nofail` : démarrage en **mode urgence**, sans réseau - il faut la console.

**À retenir** : après une modification, redémarrer pour vérifier que tout revient seul.
