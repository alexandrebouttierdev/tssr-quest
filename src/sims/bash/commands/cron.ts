import {
  addAtJob,
  CRONTAB_TEMPLATE,
  installCrontab,
  parseAtTime,
  readCrontab,
  removeCrontab,
  validateCrontab,
} from '@sims/shared/cron';
import { readFile } from '@sims/shared/fs';
import type { EditorHook } from '@sims/shared/simulator';
import { formatAtDate } from '@sims/shared/time-format';
import type { Machine } from '@sims/shared/types';
import type { BashCommand, CommandOutcome } from '../command';
import { withPending } from '../pending';

/** Messages de cron quand la table ne s'installe pas. */
function rejected(source: string, text: string): string | null {
  const errors = validateCrontab(text);
  if (errors.length > 0) {
    return `${errors.map((e) => `"${source}":${e.line}: ${e.message}`).join('\n')}\nerrors in crontab file, can't install.\n`;
  }
  if (text.length > 0 && !text.endsWith('\n'))
    return "new crontab file is missing newline before EOF, can't install.\n";
  return null;
}

/**
 * Fin de `crontab -e` : vim est fermé, la table éditée est vérifiée puis installée
 * (ou rien ne change, ou les erreurs sont signalées).
 *
 * @param machine - Machine simulée.
 * @param hook - Table en cours d'édition.
 * @param now - Horodatage (ms).
 * @returns La machine et les messages de crontab.
 */
export function finishCrontabEdit(
  machine: Machine,
  hook: EditorHook,
  now: number,
): { machine: Machine; stderr: string; exitCode: number } {
  const read = readFile(machine, hook.file, 'root');
  const text = read.ok ? read.value : hook.original;
  const dir = hook.file.slice(0, hook.file.lastIndexOf('/'));
  const cleaned = (m: Machine): Machine => {
    const fs = { ...m.fs };
    delete fs[hook.file];
    delete fs[dir];
    return { ...m, fs };
  };
  if (text === hook.original)
    return {
      machine: cleaned(machine),
      stderr: 'crontab: no changes made to crontab\n',
      exitCode: 0,
    };
  const error = rejected(hook.file, text);
  if (error)
    return { machine, stderr: `${error}crontab: edits left in ${hook.file}\n`, exitCode: 1 };
  return {
    machine: cleaned(installCrontab(machine, hook.user, text, hook.file, now)),
    stderr: 'crontab: installing new crontab\n',
    exitCode: 0,
  };
}

/** Commande `crontab` : tables de tâches planifiées des utilisateurs. */
export const crontab: BashCommand = {
  name: 'crontab',
  summary: 'gère la table des tâches planifiées (cron) d’un utilisateur',
  package: 'cron',
  manual: `NOM
       crontab - gérer la table des tâches planifiées d'un utilisateur

SYNOPSIS
       crontab -l | -e | -r [-u UTILISATEUR]      crontab FICHIER

DESCRIPTION
       Chaque ligne : minute heure jour-du-mois mois jour-de-la-semaine commande.
       « * » signifie « chaque », « */15 » « toutes les 15 », « 1-5 » une plage,
       « 1,15 » une liste. Exemple : 30 2 * * 1-5 /usr/local/bin/sauvegarde.sh
       (du lundi au vendredi à 2 h 30). Raccourcis : @daily, @hourly, @reboot…

       -l   afficher la table          -e   la modifier (dans vim)
       -r   la supprimer               -u   agir sur la table d'un autre compte (root)
       FICHIER   installer ce fichier comme table (« - » : l'entrée standard)`,
  run(args, env) {
    let target = env.user;
    let action: 'l' | 'e' | 'r' | 'install' | null = null;
    let file: string | null = null;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i] ?? '';
      if (arg === '-u') {
        if (env.user !== 'root') return { stderr: 'must be privileged to use -u\n', exitCode: 1 };
        target = args[++i] ?? '';
        if (!env.machine.users[target])
          return { stderr: `crontab: user \`${target}' unknown\n`, exitCode: 1 };
      } else if (arg === '-l' || arg === '-e' || arg === '-r')
        action = arg.slice(1) as 'l' | 'e' | 'r';
      else if (arg === '-i') continue;
      else if (arg.startsWith('-') && arg !== '-')
        return {
          stderr: `crontab: invalid option -- '${arg.slice(1)}'\ncrontab: usage error: unrecognized option\n`,
          exitCode: 1,
        };
      else {
        action = 'install';
        file = arg;
      }
    }
    const current = readCrontab(env.machine, target);
    if (action === null) {
      return {
        stderr:
          'crontab: usage error: file name must be specified for replace\nusage:\tcrontab [-u user] file\n\tcrontab [ -u user ] [ -i ] { -e | -l | -r }\n',
        exitCode: 1,
      };
    }
    if (action === 'l') {
      if (current === null) return { stderr: `no crontab for ${target}\n`, exitCode: 1 };
      return { stdout: current, exitCode: 0 };
    }
    if (action === 'r') {
      if (current === null) return { stderr: `no crontab for ${target}\n`, exitCode: 1 };
      return { machine: removeCrontab(env.machine, target), exitCode: 0 };
    }
    const now = env.ctx.now.getTime();
    if (action === 'install') {
      const source = file ?? '-';
      let text: string;
      if (source === '-') text = env.stdin;
      else {
        const read = readFile(env.machine, env.resolve(source), env.user);
        if (!read.ok) return { stderr: `${source}: No such file or directory\n`, exitCode: 1 };
        text = read.value;
      }
      const error = rejected(source, text);
      if (error) return { stderr: error, exitCode: 1 };
      return { machine: installCrontab(env.machine, target, text, source, now), exitCode: 0 };
    }
    // crontab -e : copie dans un fichier temporaire, édition dans vim, installation à la fermeture.
    const suffix = Array.from({ length: 6 }, () =>
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'.charAt(
        env.ctx.rng.int(0, 61),
      ),
    ).join('');
    const dir = `/tmp/crontab.${suffix}`;
    const path = `${dir}/crontab`;
    const original = current ?? CRONTAB_TEMPLATE;
    const account = env.machine.users[target];
    const group = account?.group ?? target;
    const machine: Machine = {
      ...env.machine,
      fs: {
        ...env.machine.fs,
        [dir]: { type: 'dir', owner: target, group, mode: 0o700, mtime: now },
        [path]: { type: 'file', owner: target, group, mode: 0o600, mtime: now, content: original },
      },
    };
    const outcome: CommandOutcome = {
      machine,
      exitCode: 0,
      effects: [
        {
          type: 'open-editor',
          path,
          onClose: { kind: 'crontab', user: target, file: path, original },
        },
      ],
    };
    return current === null
      ? { ...outcome, stderr: `no crontab for ${target} - using an empty one\n` }
      : outcome;
  },
};

/** Annonce d'un travail `at` (sur la sortie d'erreur, comme le vrai `at`). */
function atAnnounce(id: number, time: number): string {
  return `warning: commands will be executed using /bin/sh\njob ${id} at ${formatAtDate(time)}\n`;
}

/** Commande `at` : exécute des commandes une fois, à une heure donnée. */
export const at: BashCommand = {
  name: 'at',
  summary: 'programme des commandes à exécuter une seule fois, plus tard',
  package: 'at',
  manual: `NOM
       at, atq, atrm - programmer une commande unique

SYNOPSIS
       at HEURE        atq        atrm NUMÉRO

DESCRIPTION
       at lit les commandes à exécuter (une par ligne, Ctrl+D pour finir) ou
       les reçoit par un tube. HEURE : 23:00, now + 30 minutes, midnight, noon,
       tomorrow… Pour une tâche répétée, utiliser cron (crontab -e).

EXEMPLES
       echo "systemctl restart apache2" | sudo at 02:00
       atq                     liste des travaux en attente`,
  run(args, env) {
    if (args.length === 0) return { stderr: 'Garbled time\n', exitCode: 1 };
    const now = env.ctx.now.getTime();
    const time = parseAtTime(args, now);
    if (time === null)
      return {
        stderr: 'syntax error. Last token seen: ' + (args.at(-1) ?? '') + '\nGarbled time\n',
        exitCode: 1,
      };
    if (env.isTerminal && env.stdin === '') {
      // Pas de tube : at demande les commandes à son invite, jusqu'à Ctrl+D.
      return {
        exitCode: 0,
        stderr: 'warning: commands will be executed using /bin/sh\n',
        machine: withPending(env.machine, {
          kind: 'at',
          prompt: 'at> ',
          secret: false,
          data: { user: env.user, time: String(time), commands: '' },
        }),
      };
    }
    const { machine, job } = addAtJob(env.machine, env.user, time, env.stdin);
    return { machine, stderr: atAnnounce(job.id, time), exitCode: 0 };
  },
};

/** Commande `atq` : travaux `at` en attente. */
export const atq: BashCommand = {
  name: 'atq',
  summary: 'liste les travaux programmés avec at',
  package: 'at',
  manual: at.manual,
  run(_args, env) {
    const jobs = (env.machine.atJobs ?? []).filter(
      (j) => env.user === 'root' || j.user === env.user,
    );
    return {
      stdout: jobs.map((j) => `${j.id}\t${formatAtDate(j.time)} a ${j.user}\n`).join(''),
      exitCode: 0,
    };
  },
};

/** Commande `atrm` : supprime des travaux `at`. */
export const atrm: BashCommand = {
  name: 'atrm',
  summary: 'supprime un travail programmé avec at',
  package: 'at',
  manual: at.manual,
  run(args, env) {
    let jobs = [...(env.machine.atJobs ?? [])];
    let stderr = '';
    for (const arg of args) {
      const job = jobs.find((j) => String(j.id) === arg);
      if (!job) stderr += `Cannot find jobid ${arg}\n`;
      else if (env.user !== 'root' && job.user !== env.user) stderr += `${arg}: Not owner\n`;
      else jobs = jobs.filter((j) => j !== job);
    }
    return { machine: { ...env.machine, atJobs: jobs }, stderr, exitCode: stderr ? 1 : 0 };
  },
};
