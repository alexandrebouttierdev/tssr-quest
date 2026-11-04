# Mémoire, charge et priorités

- `free -h` : mémoire et swap. La colonne **disponible** compte, pas « libre » (Linux utilise la mémoire libre comme cache).
- `uptime` : charge moyenne sur 1, 5 et 15 minutes ; au-delà du nombre de processeurs, le serveur sature.
- `top` : processus en direct (`M` tri par mémoire, `P` par processeur, `q` quitter) ; `ps aux --sort=-%mem | head`.
- **Signaux** : `kill PID` (SIGTERM, 15, demande d'arrêt), `kill -9 PID` (SIGKILL, forcé), `kill -HUP PID` (relire la configuration).
- **Priorités** : de -20 (prioritaire) à 19 (gentil). `nice -n 15 commande` au lancement, `sudo renice -n 15 -p PID` ensuite. Seul root peut baisser la valeur.

**À retenir** : ralentir une sauvegarde plutôt que la tuer ; une fuite de mémoire se corrige dans le programme, pas en redémarrant tous les jours.
