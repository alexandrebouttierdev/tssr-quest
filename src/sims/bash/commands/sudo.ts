import { userGroups } from '@sims/shared/permissions';
import { switchUser } from '../pending';
import { failure, type BashCommand } from '../command';

/** Commande `sudo` : exécute une commande en tant que root (ou autre compte avec -u). */
export const sudo: BashCommand = {
  name: 'sudo',
  summary: 'exécute une commande avec les droits root',
  manual: `NOM
       sudo - exécuter une commande en tant qu'un autre utilisateur

SYNOPSIS
       sudo [-u UTILISATEUR] COMMANDE [ARGUMENTS]

DESCRIPTION
       Exécute COMMANDE avec les droits de root (ou du compte indiqué par -u).
       Seuls les membres du groupe sudo (voir /etc/sudoers) y ont droit.
       Chaque utilisation est journalisée dans /var/log/auth.log.

       Attention : une redirection (> fichier) est faite par votre shell, avec
       vos propres droits, et non par sudo.

EXEMPLES
       sudo systemctl restart apache2
       sudo rm /var/log/debug.log`,
  run(args, env) {
    let target = 'root';
    let index = 0;
    while (index < args.length && (args[index] ?? '').startsWith('-')) {
      const option = args[index] ?? '';
      if (option === '-u') {
        target = args[index + 1] ?? '';
        index += 2;
      } else if (option === '-i' || option === '-s') {
        // Shell root : sudo -i (connexion) ou sudo -s ; exit pour revenir.
        if (env.user !== 'root' && !userGroups(env.machine, env.user).includes('sudo')) break;
        const shell = switchUser(env.machine, 'root', option === '-i');
        // sudo impose son secure_path au shell root : /usr/sbin y est, contrairement à `su`.
        return {
          exitCode: 0,
          machine: {
            ...shell,
            session: {
              ...shell.session,
              env: {
                ...shell.session.env,
                PATH: '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin',
              },
            },
          },
        };
      } else if (option === '--') {
        index++;
        break;
      } else {
        return failure(`sudo: l'option ${option} n'est pas disponible dans cette simulation`);
      }
    }
    const argv = args.slice(index);
    if (argv.length === 0) {
      return failure(
        'utilisation : sudo -h | -K | -k | -V\nutilisation : sudo [-u utilisateur] [<commande>]',
      );
    }
    if (env.user !== 'root' && !userGroups(env.machine, env.user).includes('sudo')) {
      return failure(
        `${env.user} n'apparaît pas dans le fichier sudoers. Cet incident a été signalé à l'administrateur.`,
      );
    }
    if (!env.machine.users[target]) return failure(`sudo: utilisateur inconnu : ${target}`);
    return env.runAs(target, argv);
  },
};
