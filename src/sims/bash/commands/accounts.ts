import { syncAccountFiles } from '@sims/shared/factories';
import { childrenOf, makeDir, removePath, setNode } from '@sims/shared/fs';
import type { Group, Machine, UserAccount } from '@sims/shared/types';
import type { BashCommand, CommandEnv, CommandOutcome } from '../command';
import { switchUser, updateUser, withPending } from '../pending';
import { formatDate } from './info';

/** Erreur des outils shadow quand on n'est pas root. */
function notRoot(command: string): CommandOutcome {
  return {
    stderr: `${command} : Permission non accordée.\n${command} : impossible de verrouiller /etc/passwd ; réessayez plus tard.\n`,
    exitCode: 1,
  };
}

/** Jour courant (jours depuis 1970). */
function today(env: CommandEnv): number {
  return Math.floor(env.ctx.now.getTime() / 86_400_000);
}

/** Lit des options `-x valeur` ; renvoie les options et les opérandes. */
function readOptions(
  args: readonly string[],
  withValue: string,
  flags: string,
): { opts: Map<string, string>; set: Set<string>; operands: string[]; bad?: string } {
  const opts = new Map<string, string>();
  const set = new Set<string>();
  const operands: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (!arg.startsWith('-') || arg === '-') {
      operands.push(arg);
      continue;
    }
    for (let j = 1; j < arg.length; j++) {
      const c = arg[j] ?? '';
      if (withValue.includes(c)) {
        opts.set(c, arg.length > j + 1 ? arg.slice(j + 1) : (args[++i] ?? ''));
        break;
      }
      if (!flags.includes(c)) return { opts, set, operands, bad: c };
      set.add(c);
    }
  }
  return { opts, set, operands };
}

/** Message d'option invalide des outils shadow. */
function invalid(command: string, letter: string): CommandOutcome {
  return {
    stderr: `${command} : option invalide -- '${letter}'\nUtilisation : ${command} [options] IDENTIFIANT\n`,
    exitCode: 2,
  };
}

/** Ajoute un compte (et son groupe homonyme) ; renvoie la machine ou un message d'erreur. */
function addAccount(
  env: CommandEnv,
  name: string,
  options: {
    home?: string;
    createHome: boolean;
    shell: string;
    group?: string;
    groups: string[];
    comment: string;
    uid?: number;
    system?: boolean;
  },
): { machine?: Machine; error?: string; gid?: number; uid?: number } {
  const machine = env.machine;
  if (!/^[a-z_][a-z0-9_.-]*$/.test(name))
    return { error: `useradd : « ${name} » n'est pas un nom d'utilisateur valide` };
  if (machine.users[name]) return { error: `useradd : l'utilisateur « ${name} » existe déjà` };
  for (const g of [...options.groups, ...(options.group ? [options.group] : [])]) {
    if (!machine.groups[g]) return { error: `useradd : le groupe « ${g} » n'existe pas` };
  }
  const uids = Object.values(machine.users)
    .map((u) => u.uid)
    .filter((u) => (options.system ? u < 1000 && u >= 100 : u >= 1000 && u < 60000));
  const uid = options.uid ?? (uids.length ? Math.max(...uids) + 1 : options.system ? 100 : 1000);
  if (Object.values(machine.users).some((u) => u.uid === uid))
    return { error: `useradd : l'UID ${uid} n'est pas unique` };
  const groups: Record<string, Group> = { ...machine.groups };
  let primary = options.group;
  if (!primary) {
    if (groups[name])
      return {
        error: `useradd : le groupe ${name} existe. Si vous voulez ajouter cet utilisateur à ce groupe, utilisez -g.`,
      };
    const used = new Set(Object.values(groups).map((g) => g.gid));
    let gid = uid;
    while (used.has(gid)) gid++;
    groups[name] = { name, gid, members: [] };
    primary = name;
  }
  for (const g of options.groups) {
    const group = groups[g];
    if (group) groups[g] = { ...group, members: [...group.members, name] };
  }
  const home = options.home ?? `/home/${name}`;
  const account: UserAccount = {
    name,
    uid,
    group: primary,
    home,
    shell: options.shell,
    gecos: options.comment,
    password: null,
    locked: false,
    lastChange: today(env),
  };
  let next: Machine = { ...machine, users: { ...machine.users, [name]: account }, groups };
  if (options.createHome && !next.fs[home]) {
    const made = makeDir(next, home, 'root', { parents: true, now: env.ctx.now.getTime() });
    if (made.ok) {
      next = setNode(made.value, home, {
        type: 'dir',
        owner: name,
        group: primary,
        mode: 0o700,
        mtime: env.ctx.now.getTime(),
      });
      for (const skel of childrenOf(next.fs, '/etc/skel'))
        next = setNode(next, `${home}/${skel.name}`, { ...skel.node, owner: name, group: primary });
    }
  }
  return {
    machine: syncAccountFiles(next, env.ctx.now.getTime()),
    gid: groups[primary]?.gid ?? uid,
    uid,
  };
}

/** Commande `useradd` : crée un compte (outil bas niveau). */
export const useradd: BashCommand = {
  name: 'useradd',
  summary: 'crée un compte utilisateur (bas niveau)',
  manual: `NOM
       useradd - créer un compte utilisateur

SYNOPSIS
       useradd [-m] [-s SHELL] [-g GROUPE] [-G GROUPES] [-c COMMENTAIRE] NOM

DESCRIPTION
       Crée le compte, sans mot de passe (à définir avec passwd).
       Attention, sur Debian, sans -m le dossier personnel n'est PAS créé et
       le shell par défaut est /bin/sh. adduser fait tout cela pour vous.

       -m       créer le dossier personnel (copie de /etc/skel)
       -s SHELL shell de connexion (/bin/bash)
       -g GRP   groupe principal        -G G1,G2  groupes secondaires
       -c TEXTE nom complet             -d DIR    dossier personnel
       -r       compte système          -u UID    identifiant

EXEMPLES
       sudo useradd -m -s /bin/bash -c "Julie Martin" -G compta julie
       sudo passwd julie`,
  run(args, env) {
    const { opts, set, operands, bad } = readOptions(args, 'sgGcdu', 'mMr');
    if (bad) return invalid('useradd', bad);
    if (env.user !== 'root') return notRoot('useradd');
    const name = operands[0];
    if (!name) return { stderr: 'Utilisation : useradd [options] IDENTIFIANT\n', exitCode: 2 };
    const result = addAccount(env, name, {
      ...(opts.has('d') ? { home: opts.get('d') ?? '' } : {}),
      createHome: set.has('m') && !set.has('M'),
      shell: opts.get('s') ?? '/bin/sh',
      ...(opts.has('g') ? { group: opts.get('g') ?? '' } : {}),
      groups: (opts.get('G') ?? '').split(',').filter(Boolean),
      comment: opts.get('c') ?? '',
      ...(opts.has('u') ? { uid: Number(opts.get('u')) } : {}),
      system: set.has('r'),
    });
    if (result.error) return { stderr: `${result.error}\n`, exitCode: 9 };
    return { exitCode: 0, ...(result.machine ? { machine: result.machine } : {}) };
  },
};

/** Commande `adduser` : crée un compte de façon interactive (Debian). */
export const adduser: BashCommand = {
  name: 'adduser',
  summary: 'crée un compte complet de façon guidée (Debian)',
  manual: `NOM
       adduser - créer un utilisateur, de façon guidée

SYNOPSIS
       adduser NOM
       adduser NOM GROUPE        (ajoute un compte existant à un groupe)

DESCRIPTION
       Crée le compte, son groupe, son dossier personnel (avec /etc/skel), puis
       demande le mot de passe et le nom complet. C'est la méthode recommandée
       sur Debian.`,
  run(args, env) {
    if (env.user !== 'root')
      return {
        stderr:
          'fatal : Seul le superutilisateur peut ajouter un utilisateur ou un groupe sur le système.\n',
        exitCode: 1,
      };
    const [name, group] = args.filter((a) => !a.startsWith('-'));
    if (!name) return { stderr: 'fatal : Un seul ou deux noms sont permis.\n', exitCode: 1 };
    if (group !== undefined) {
      const g = env.machine.groups[group];
      if (!env.machine.users[name])
        return { stderr: `fatal : L'utilisateur « ${name} » n'existe pas.\n`, exitCode: 1 };
      if (!g) return { stderr: `fatal : Le groupe « ${group} » n'existe pas.\n`, exitCode: 1 };
      if (g.members.includes(name))
        return {
          stdout: `L'utilisateur « ${name} » appartient déjà au groupe « ${group} ».\n`,
          exitCode: 0,
        };
      const machine = syncAccountFiles(
        {
          ...env.machine,
          groups: { ...env.machine.groups, [group]: { ...g, members: [...g.members, name] } },
        },
        env.ctx.now.getTime(),
      );
      return {
        machine,
        stdout: `Ajout de l'utilisateur « ${name} » au groupe « ${group} » ...\nFait.\n`,
        exitCode: 0,
      };
    }
    if (env.machine.users[name])
      return { stderr: `fatal : L'utilisateur « ${name} » existe déjà.\n`, exitCode: 1 };
    const result = addAccount(env, name, {
      createHome: true,
      shell: '/bin/bash',
      groups: ['users'],
      comment: ',,,',
    });
    if (!result.machine) return { stderr: `fatal : ${result.error ?? ''}\n`, exitCode: 1 };
    const stdout = `Ajout de l'utilisateur « ${name} » ...\nAjout du nouveau groupe « ${name} » (${result.gid}) ...\nAjout du nouvel utilisateur « ${name} » (${result.uid}) avec le groupe « ${name} (${result.gid}) » ...\nCréation du répertoire personnel « /home/${name} » ...\nCopie des fichiers depuis « /etc/skel » ...\n`;
    // Le mot de passe est ensuite demandé, comme passwd, puis les informations GECOS.
    const machine = withPending(result.machine, {
      kind: 'passwd-new',
      prompt: 'Nouveau mot de passe : ',
      secret: true,
      data: { user: name, then: 'adduser' },
    });
    return { machine, stdout, exitCode: 0 };
  },
};

/** Commande `usermod` : modifie un compte. */
export const usermod: BashCommand = {
  name: 'usermod',
  summary: 'modifie un compte (groupes, shell, verrouillage…)',
  manual: `NOM
       usermod - modifier un compte utilisateur

SYNOPSIS
       usermod [OPTIONS] NOM

DESCRIPTION
       -aG G1,G2  AJOUTER aux groupes secondaires (sans -a, la liste REMPLACE
                  tous les groupes secondaires : erreur classique !)
       -g GRP     changer le groupe principal
       -s SHELL   changer le shell         -c TEXTE  nom complet
       -d DIR -m  déplacer le dossier personnel
       -l NOUVEAU renommer le compte
       -L / -U    verrouiller / déverrouiller le compte
       -e DATE    date d'expiration du compte (AAAA-MM-JJ)

EXEMPLES
       sudo usermod -aG sudo julie`,
  run(args, env) {
    const { opts, set, operands, bad } = readOptions(args, 'gGsdlce', 'amLU');
    if (bad) return invalid('usermod', bad);
    if (env.user !== 'root') return notRoot('usermod');
    const name = operands[0] ?? '';
    const user = env.machine.users[name];
    if (!user) return { stderr: `usermod : l'utilisateur « ${name} » n'existe pas\n`, exitCode: 6 };
    let groups: Record<string, Group> = { ...env.machine.groups };
    let account: UserAccount = { ...user };
    if (opts.has('g')) {
      const g = opts.get('g') ?? '';
      if (!groups[g]) return { stderr: `usermod : le groupe « ${g} » n'existe pas\n`, exitCode: 6 };
      account = { ...account, group: g };
    }
    if (opts.has('G')) {
      const wanted = (opts.get('G') ?? '').split(',').filter(Boolean);
      const missing = wanted.find((g) => !groups[g]);
      if (missing)
        return { stderr: `usermod : le groupe « ${missing} » n'existe pas\n`, exitCode: 6 };
      groups = Object.fromEntries(
        Object.entries(groups).map(([gName, g]) => {
          const member = g.members.includes(name);
          if (wanted.includes(gName))
            return [gName, member ? g : { ...g, members: [...g.members, name] }];
          // Sans -a, les groupes secondaires non listés sont retirés.
          return [
            gName,
            !set.has('a') && member ? { ...g, members: g.members.filter((m) => m !== name) } : g,
          ];
        }),
      );
    } else if (set.has('a')) {
      return {
        stderr: "usermod : l'option -a ne peut être utilisée qu'avec l'option -G\n",
        exitCode: 2,
      };
    }
    if (opts.has('s')) account = { ...account, shell: opts.get('s') ?? account.shell };
    if (opts.has('c')) account = { ...account, gecos: opts.get('c') ?? '' };
    if (opts.has('e')) account = { ...account, expires: opts.get('e') || null };
    if (set.has('L')) account = { ...account, locked: true };
    if (set.has('U')) account = { ...account, locked: false };
    let machine: Machine = env.machine;
    if (opts.has('d')) {
      const home = opts.get('d') ?? account.home;
      if (set.has('m') && machine.fs[account.home] && !machine.fs[home]) {
        const fs = Object.fromEntries(
          Object.entries(machine.fs).map(([p, n]) => [
            p === account.home || p.startsWith(`${account.home}/`)
              ? home + p.slice(account.home.length)
              : p,
            n,
          ]),
        );
        machine = { ...machine, fs };
      }
      account = { ...account, home };
    }
    const users: Record<string, UserAccount> = { ...machine.users };
    if (opts.has('l')) {
      const newName = opts.get('l') ?? name;
      if (users[newName])
        return { stderr: `usermod : l'utilisateur « ${newName} » existe déjà\n`, exitCode: 9 };
      delete users[name];
      account = { ...account, name: newName };
      users[newName] = account;
      groups = Object.fromEntries(
        Object.entries(groups).map(([g, grp]) => [
          g,
          { ...grp, members: grp.members.map((m) => (m === name ? newName : m)) },
        ]),
      );
    } else users[name] = account;
    return {
      exitCode: 0,
      machine: syncAccountFiles({ ...machine, users, groups }, env.ctx.now.getTime()),
    };
  },
};

/** Commande `userdel` : supprime un compte. */
export const userdel: BashCommand = {
  name: 'userdel',
  summary: 'supprime un compte utilisateur',
  manual: `NOM
       userdel - supprimer un compte utilisateur

SYNOPSIS
       userdel [-r] NOM

DESCRIPTION
       -r     supprimer aussi le dossier personnel et la boîte aux lettres.
       Avant de supprimer le compte d'un collaborateur parti, pensez à
       sauvegarder ses fichiers : souvent, on commence par le verrouiller
       (usermod -L) le temps de vérifier.`,
  run(args, env) {
    const { set, operands, bad } = readOptions(args, '', 'rf');
    if (bad) return invalid('userdel', bad);
    if (env.user !== 'root') return notRoot('userdel');
    const name = operands[0] ?? '';
    const user = env.machine.users[name];
    if (!user) return { stderr: `userdel : l'utilisateur « ${name} » n'existe pas\n`, exitCode: 6 };
    const process = env.machine.processes.find((p) => p.user === name);
    if (process && !set.has('f'))
      return {
        stderr: `userdel : l'utilisateur ${name} est actuellement utilisé par le processus ${process.pid}\n`,
        exitCode: 8,
      };
    const users = { ...env.machine.users };
    delete users[name];
    const groups = Object.fromEntries(
      Object.entries(env.machine.groups)
        .filter(
          ([g, grp]) =>
            !(
              g === user.group &&
              g === name &&
              !Object.values(users).some((u) => u.group === g) &&
              grp.members.length === 0
            ),
        )
        .map(([g, grp]) => [g, { ...grp, members: grp.members.filter((m) => m !== name) }]),
    );
    let machine: Machine = { ...env.machine, users, groups };
    if (set.has('r') && machine.fs[user.home]) {
      const removed = removePath(machine, user.home, 'root', { recursive: true });
      if (removed.ok) machine = removed.value;
    }
    const crontabs = { ...machine.crontabs };
    delete crontabs[name];
    return {
      exitCode: 0,
      machine: syncAccountFiles({ ...machine, crontabs }, env.ctx.now.getTime()),
    };
  },
};

/** Commande `groupadd` : crée un groupe. */
export const groupadd: BashCommand = {
  name: 'groupadd',
  summary: 'crée un groupe',
  manual: `NOM
       groupadd - créer un groupe

SYNOPSIS
       groupadd [-g GID] [-r] NOM

EXEMPLES
       sudo groupadd compta`,
  run(args, env) {
    const { opts, set, operands, bad } = readOptions(args, 'g', 'rf');
    if (bad) return invalid('groupadd', bad);
    if (env.user !== 'root')
      return {
        stderr:
          'groupadd : Permission non accordée.\ngroupadd : impossible de verrouiller /etc/group ; réessayez plus tard.\n',
        exitCode: 10,
      };
    const name = operands[0] ?? '';
    if (!/^[a-z_][a-z0-9_.-]*$/.test(name))
      return { stderr: `groupadd : « ${name} » n'est pas un nom de groupe valide\n`, exitCode: 3 };
    if (env.machine.groups[name])
      return set.has('f')
        ? { exitCode: 0 }
        : { stderr: `groupadd : le groupe « ${name} » existe déjà\n`, exitCode: 9 };
    const used = Object.values(env.machine.groups).map((g) => g.gid);
    const gid = opts.has('g')
      ? Number(opts.get('g'))
      : Math.max(999, ...used.filter((g) => (set.has('r') ? g < 1000 : g >= 1000 && g < 60000))) +
        1;
    if (used.includes(gid))
      return { stderr: `groupadd : le GID « ${gid} » existe déjà\n`, exitCode: 4 };
    return {
      exitCode: 0,
      machine: syncAccountFiles(
        { ...env.machine, groups: { ...env.machine.groups, [name]: { name, gid, members: [] } } },
        env.ctx.now.getTime(),
      ),
    };
  },
};

/** Commande `groupdel` : supprime un groupe. */
export const groupdel: BashCommand = {
  name: 'groupdel',
  summary: 'supprime un groupe',
  manual: `NOM
       groupdel - supprimer un groupe

SYNOPSIS
       groupdel NOM`,
  run(args, env) {
    if (env.user !== 'root')
      return {
        stderr:
          'groupdel : Permission non accordée.\ngroupdel : impossible de verrouiller /etc/group ; réessayez plus tard.\n',
        exitCode: 10,
      };
    const name = args[0] ?? '';
    if (!env.machine.groups[name])
      return { stderr: `groupdel : le groupe « ${name} » n'existe pas\n`, exitCode: 6 };
    const owner = Object.values(env.machine.users).find((u) => u.group === name);
    if (owner)
      return {
        stderr: `groupdel : impossible de supprimer le groupe primaire de l'utilisateur « ${owner.name} »\n`,
        exitCode: 8,
      };
    const groups = { ...env.machine.groups };
    delete groups[name];
    return {
      exitCode: 0,
      machine: syncAccountFiles({ ...env.machine, groups }, env.ctx.now.getTime()),
    };
  },
};

/** Commande `gpasswd` : ajoute ou retire un membre d'un groupe. */
export const gpasswd: BashCommand = {
  name: 'gpasswd',
  summary: "ajoute ou retire un membre d'un groupe",
  manual: `NOM
       gpasswd - administrer un groupe

SYNOPSIS
       gpasswd -a UTILISATEUR GROUPE      ajouter au groupe
       gpasswd -d UTILISATEUR GROUPE      retirer du groupe`,
  run(args, env) {
    const [option, user = '', group = ''] = args;
    if (option !== '-a' && option !== '-d')
      return { stderr: 'Utilisation : gpasswd [option] GROUPE\n', exitCode: 2 };
    if (env.user !== 'root') return { stderr: 'gpasswd : Permission non accordée.\n', exitCode: 3 };
    const g = env.machine.groups[group];
    if (!g) return { stderr: `gpasswd : le groupe « ${group} » n'existe pas\n`, exitCode: 3 };
    if (!env.machine.users[user])
      return { stderr: `gpasswd : l'utilisateur « ${user} » n'existe pas\n`, exitCode: 3 };
    if (option === '-d' && !g.members.includes(user))
      return {
        stderr: `gpasswd : l'utilisateur « ${user} » n'est pas membre de « ${group} »\n`,
        exitCode: 3,
      };
    const members =
      option === '-a' ? [...new Set([...g.members, user])] : g.members.filter((m) => m !== user);
    const machine = syncAccountFiles(
      { ...env.machine, groups: { ...env.machine.groups, [group]: { ...g, members } } },
      env.ctx.now.getTime(),
    );
    return {
      machine,
      stdout:
        option === '-a'
          ? `Ajout de l'utilisateur ${user} au groupe ${group}\n`
          : `Retrait de l'utilisateur ${user} du groupe ${group}\n`,
      exitCode: 0,
    };
  },
};

/** Commande `passwd` : change un mot de passe (ou verrouille le compte). */
export const passwd: BashCommand = {
  name: 'passwd',
  summary: 'change un mot de passe',
  manual: `NOM
       passwd - changer le mot de passe d'un compte

SYNOPSIS
       passwd [OPTION] [UTILISATEUR]

DESCRIPTION
       Sans option, demande le nouveau mot de passe (deux fois, saisie
       masquée). Un utilisateur ne peut changer que le sien (et doit donner
       l'actuel) ; root peut changer celui de n'importe qui.

       -l     verrouiller le compte      -u     déverrouiller
       -e     forcer le changement à la prochaine connexion
       -S     afficher l'état du mot de passe
       -d     supprimer le mot de passe`,
  run(args, env) {
    const flags = args
      .filter((a) => a.startsWith('-'))
      .join('')
      .replace(/-/g, '');
    const target = args.find((a) => !a.startsWith('-')) ?? env.user;
    const account = env.machine.users[target];
    if (!account)
      return { stderr: `passwd : l'utilisateur « ${target} » n'existe pas\n`, exitCode: 1 };
    if (target !== env.user && env.user !== 'root')
      return {
        stderr: `passwd : Vous ne pouvez pas voir ou modifier les informations du mot de passe pour ${target}.\n`,
        exitCode: 1,
      };
    if (flags.includes('S')) {
      const state = account.locked ? 'L' : account.password === null ? 'NP' : 'P';
      return {
        stdout: `${target} ${state} ${formatDate((account.lastChange ?? today(env)) * 86_400_000, '%m/%d/%Y')} ${account.minDays ?? 0} ${account.maxDays ?? 99999} ${account.warnDays ?? 7} -1\n`,
        exitCode: 0,
      };
    }
    if (/[lued]/.test(flags)) {
      if (env.user !== 'root')
        return { stderr: 'passwd : Permission non accordée.\n', exitCode: 1 };
      const change: Partial<UserAccount> = flags.includes('l')
        ? { locked: true }
        : flags.includes('u')
          ? { locked: false }
          : flags.includes('e')
            ? { lastChange: 0 }
            : { password: null };
      return {
        machine: updateUser(env.machine, target, change, env.ctx),
        stdout: "passwd : information d'expiration du mot de passe modifiée.\n",
        exitCode: 0,
      };
    }
    if (flags) return { stderr: `passwd : option invalide -- '${flags[0] ?? ''}'\n`, exitCode: 2 };
    const first =
      env.user === 'root'
        ? {
            kind: 'passwd-new',
            prompt: 'Nouveau mot de passe : ',
            secret: true,
            data: { user: target },
          }
        : {
            kind: 'passwd-current',
            prompt: 'Mot de passe actuel : ',
            secret: true,
            data: { user: target },
          };
    return {
      machine: withPending(env.machine, first),
      exitCode: 0,
      stdout: env.user === 'root' ? '' : `Changement du mot de passe pour ${target}.\n`,
    };
  },
};

/** Date d'un champ de chage (`nov. 03, 2026` ou `jamais`). */
function chageDate(days: number | null): string {
  if (days === null) return 'jamais';
  return formatDate(days * 86_400_000 + 43_200_000, '%b %d, %Y');
}

/** Commande `chage` : politique d'expiration du mot de passe. */
export const chage: BashCommand = {
  name: 'chage',
  summary: "gère l'expiration des mots de passe",
  manual: `NOM
       chage - changer les informations d'expiration du mot de passe

SYNOPSIS
       chage [-l] [-d JOURS] [-M MAX] [-m MIN] [-W AVERT] [-E DATE] UTILISATEUR

DESCRIPTION
       -l        afficher les informations
       -d 0      obliger à changer le mot de passe à la prochaine connexion
       -M 90     mot de passe valable 90 jours au plus
       -E DATE   date de fin du compte (AAAA-MM-JJ ; -1 pour aucune)`,
  run(args, env) {
    const { opts, set, operands, bad } = readOptions(args, 'dMmWE', 'l');
    if (bad) return invalid('chage', bad);
    const name = operands[0] ?? '';
    const user = env.machine.users[name];
    if (!user) return { stderr: `chage : l'utilisateur « ${name} » n'existe pas\n`, exitCode: 1 };
    if (set.has('l')) {
      if (env.user !== 'root' && env.user !== name)
        return { stderr: 'chage : Permission non accordée.\n', exitCode: 1 };
      const last = user.lastChange ?? today(env);
      const max = user.maxDays ?? 99999;
      const expiry =
        last === 0
          ? 'le mot de passe doit être changé'
          : max >= 99999
            ? 'jamais'
            : chageDate(last + max);
      const lines = [
        [
          'Dernière modification du mot de passe',
          last === 0 ? 'le mot de passe doit être changé' : chageDate(last),
        ],
        ['Expiration du mot de passe', expiry],
        ['Mot de passe désactivé', 'jamais'],
        [
          'Fin de validité du compte',
          user.expires
            ? chageDate(Math.floor(Date.parse(`${user.expires}T00:00:00Z`) / 86_400_000))
            : 'jamais',
        ],
        [
          'Nombre minimum de jours entre les changements de mot de passe',
          String(user.minDays ?? 0),
        ],
        ['Nombre maximum de jours entre les changements de mot de passe', String(max)],
        [
          "Nombre de jours d'avertissement avant l'expiration du mot de passe",
          String(user.warnDays ?? 7),
        ],
      ];
      return {
        stdout: lines.map(([k, v]) => `${(k ?? '').padEnd(64)}: ${v ?? ''}\n`).join(''),
        exitCode: 0,
      };
    }
    if (env.user !== 'root')
      return {
        stderr:
          'chage : Permission non accordée.\nchage : impossible de verrouiller /etc/shadow ; réessayez plus tard.\n',
        exitCode: 1,
      };
    const change: { -readonly [K in keyof UserAccount]?: UserAccount[K] } = {};
    if (opts.has('d')) change.lastChange = Number(opts.get('d'));
    if (opts.has('M')) change.maxDays = Number(opts.get('M'));
    if (opts.has('m')) change.minDays = Number(opts.get('m'));
    if (opts.has('W')) change.warnDays = Number(opts.get('W'));
    if (opts.has('E')) change.expires = opts.get('E') === '-1' ? null : (opts.get('E') ?? null);
    return { exitCode: 0, machine: updateUser(env.machine, name, change, env.ctx) };
  },
};

/** Commande `su` : ouvre une session sous un autre compte. */
export const su: BashCommand = {
  name: 'su',
  summary: 'ouvre une session sous un autre compte',
  manual: `NOM
       su - changer d'utilisateur

SYNOPSIS
       su [-] [UTILISATEUR]

DESCRIPTION
       Ouvre un shell sous UTILISATEUR (root par défaut) après avoir demandé
       SON mot de passe. Avec « - », c'est une vraie connexion (dossier
       personnel et environnement du compte). exit pour revenir.
       Sur un serveur, on préfère sudo : chacun garde son mot de passe et
       chaque action est tracée.`,
  run(args, env) {
    const login = args.includes('-') || args.includes('-l') || args.includes('--login');
    const target = args.find((a) => !a.startsWith('-')) ?? 'root';
    if (!env.machine.users[target])
      return {
        stderr: `su: l'utilisateur ${target} n'existe pas ou le système de gestion utilisateur n'est pas actif\n`,
        exitCode: 1,
      };
    if (env.user === 'root')
      return { exitCode: 0, machine: switchUser(env.machine, target, login) };
    return {
      exitCode: 0,
      machine: withPending(env.machine, {
        kind: 'su',
        prompt: 'Mot de passe : ',
        secret: true,
        data: { user: target, login: String(login) },
      }),
    };
  },
};
