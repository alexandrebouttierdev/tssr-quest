# Processus, redirections et tubes

- `ps aux` : tous les processus (PID, %CPU, %MEM, commande). `top` : la même chose en direct (q pour quitter).
- `kill PID` : demande d'arrêt (SIGTERM, 15). `kill -9 PID` : arrêt forcé (SIGKILL), en dernier recours. `killall nom` : par nom.
- `commande &` : en arrière-plan ; `jobs`, `fg`, `bg`, Ctrl+Z pour suspendre.
- **Redirections** : `>` écrit dans un fichier (en l'écrasant), `>>` ajoute à la fin, `2>` redirige les erreurs, `2>&1` les mélange à la sortie, `<` lit un fichier.
- **Tube** `|` : la sortie d'une commande devient l'entrée de la suivante - `ps aux | grep apache | wc -l`.

**À retenir** : `/dev/null` est un trou noir - `commande 2>/dev/null` fait taire les erreurs.
