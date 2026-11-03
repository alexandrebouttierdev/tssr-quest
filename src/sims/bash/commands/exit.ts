import type { BashCommand } from '../command';

/** Commande interne `exit` : ferme la session. */
export const exit: BashCommand = {
  name: 'exit',
  builtin: true,
  summary: 'ferme la session',
  manual: `NOM
       exit - fermer la session

SYNOPSIS
       exit [CODE]

DESCRIPTION
       Termine le shell et ferme la session SSH. Le code de retour vaut CODE,
       ou celui de la dernière commande.`,
  run(args, env) {
    // Dans une session ouverte par su ou sudo -i, exit revient à la session d'origine.
    const parent = env.machine.session.parent;
    if (parent)
      return { exitCode: 0, stdout: 'déconnexion\n', machine: { ...env.machine, session: parent } };
    const raw = args[0];
    if (raw !== undefined && !/^-?\d+$/.test(raw)) {
      return {
        exitCode: 2,
        stdout: 'déconnexion\n',
        stderr: `bash: exit: ${raw} : argument numérique nécessaire\n`,
        effects: [{ type: 'exit' }],
      };
    }
    const code = raw === undefined ? env.machine.session.lastExitCode : Number(raw) & 255;
    return { exitCode: code, stdout: 'déconnexion\n', effects: [{ type: 'exit' }] };
  },
};
