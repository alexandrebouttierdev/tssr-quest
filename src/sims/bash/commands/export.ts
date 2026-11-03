import { failure, type BashCommand } from '../command';

/** Commande interne `export` : définit des variables d'environnement. */
export const exportCommand: BashCommand = {
  name: 'export',
  builtin: true,
  summary: "définit des variables d'environnement",
  manual: `NOM
       export - définir des variables d'environnement

SYNOPSIS
       export NOM=VALEUR...

DESCRIPTION
       Définit une variable et la rend visible des programmes lancés ensuite.
       Sans argument, affiche les variables exportées.

EXEMPLES
       export EDITOR=vim`,
  run(args, env) {
    const session = env.machine.session;
    if (args.length === 0) {
      const lines = Object.entries(session.env)
        .filter(([name]) => /^[A-Za-z_]/.test(name))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([name, value]) => `declare -x ${name}="${value}"`);
      return { exitCode: 0, stdout: `${lines.join('\n')}\n` };
    }
    const vars: Record<string, string> = { ...session.env };
    for (const arg of args) {
      const match = /^([A-Za-z_][A-Za-z0-9_]*)(?:=([\s\S]*))?$/.exec(arg);
      if (!match) return failure(`bash: export: « ${arg} » : identifiant non valable`);
      vars[match[1] ?? ''] = match[2] ?? vars[match[1] ?? ''] ?? '';
    }
    return { exitCode: 0, machine: { ...env.machine, session: { ...session, env: vars } } };
  },
};
