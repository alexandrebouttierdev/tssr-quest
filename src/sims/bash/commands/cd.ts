import { strerror } from '@sims/shared/errors';
import { statPath } from '@sims/shared/fs';
import { canAccess } from '@sims/shared/permissions';
import { failure, type BashCommand } from '../command';

/** Commande interne `cd` : change le répertoire courant. */
export const cd: BashCommand = {
  name: 'cd',
  builtin: true,
  summary: 'change le répertoire courant',
  manual: `NOM
       cd - changer de répertoire courant

SYNOPSIS
       cd [RÉPERTOIRE]

DESCRIPTION
       Change le répertoire courant du shell. Sans argument, retourne dans le
       dossier personnel ($HOME). « cd - » revient au répertoire précédent,
       « cd .. » remonte d'un niveau.

       Il faut le droit d'exécution (x) sur un dossier pour y entrer.

EXEMPLES
       cd /var/log      aller dans /var/log (chemin absolu)
       cd ..            remonter au dossier parent
       cd ~             revenir dans son dossier personnel`,
  run(args, env) {
    if (args.length > 1) return failure("bash: cd: trop d'arguments");
    const session = env.machine.session;
    const raw = args[0] ?? '';
    let target: string;
    let print = false;
    if (raw === '' || raw === '~') target = env.env['HOME'] ?? '/';
    else if (raw === '-') {
      if (!session.previousCwd) return failure('bash: cd: « OLDPWD » non défini');
      target = session.previousCwd;
      print = true;
    } else target = env.resolve(raw);
    const found = statPath(env.machine, target, env.user);
    if (!found.ok) return failure(`bash: cd: ${raw}: ${strerror(found.error)}`);
    if (found.value.node.type !== 'dir') return failure(`bash: cd: ${raw}: ${strerror('ENOTDIR')}`);
    if (!canAccess(env.machine, env.user, found.value.node, 'exec')) {
      return failure(`bash: cd: ${raw}: ${strerror('EACCES')}`);
    }
    // Comme bash, on garde le chemin logique (sans résoudre les liens symboliques).
    return {
      exitCode: 0,
      stdout: print ? `${target}\n` : '',
      machine: {
        ...env.machine,
        session: {
          ...session,
          cwd: target,
          previousCwd: session.cwd,
          env: { ...session.env, PWD: target, OLDPWD: session.cwd },
        },
      },
    };
  },
};
