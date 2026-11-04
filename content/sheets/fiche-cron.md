# Planifier des tâches

- `crontab -e` (éditer), `crontab -l` (lister), `crontab -r` (supprimer) ; `sudo crontab -l -u nom` pour un autre compte.
- **Format** : `minute heure jour-du-mois mois jour-de-la-semaine commande`
  - `30 2 * * *` : tous les jours à 2 h 30
  - `0 18 * * 1-5` : à 18 h du lundi au vendredi
  - `*/15 * * * *` : toutes les 15 minutes
- Tables des comptes : `/var/spool/cron/crontabs/` ; tâches système : `/etc/crontab`, `/etc/cron.d/` (avec un champ utilisateur), `/etc/cron.daily/`.
- **at** (paquet `at`) : une seule fois - `echo "commande" | at 23:00`, `atq`, `atrm N`.
- **Timers systemd** : `systemctl list-timers`, journal dans `journalctl -u nom.timer`.

**À retenir** : dans une crontab, `%` a un sens spécial (à échapper avec `\%`), et le PATH est réduit - écrire les chemins complets.
