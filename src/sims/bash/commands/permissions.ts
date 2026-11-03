import { strerror } from '@sims/shared/errors';
import { setNode, statPath } from '@sims/shared/fs';
import { isInside } from '@sims/shared/path';
import { userGroups } from '@sims/shared/permissions';
import type { FsNode, Machine } from '@sims/shared/types';
import type { BashCommand, CommandEnv } from '../command';
import { modeString } from '../format';
import { missingOperand } from './helpers';

/**
 * Calcule un nouveau mode à partir d'une notation octale (`640`, `2775`) ou
 * symbolique (`u+x`, `g-w,o=`, `a+r`, `+t`, `u=rwx,g=rx,o=`).
 *
 * @param spec - Mode tel que tapé.
 * @param current - Mode actuel.
 * @param isDir - Vrai pour un dossier (X ajoute x).
 * @param umask - Masque, pour `+x` sans destinataire.
 * @returns Le nouveau mode, ou `null` si la notation est invalide.
 */
export function applyMode(
  spec: string,
  current: number,
  isDir: boolean,
  umask = 0o022,
): number | null {
  if (/^[0-7]{1,4}$/.test(spec)) return parseInt(spec, 8);
  let mode = current & 0o7777;
  for (const clause of spec.split(',')) {
    const m = /^([ugoa]*)([-+=])([rwxXst]*)$/.exec(clause);
    if (!m) return null;
    const who = m[1] || 'a';
    const op = m[2];
    const perms = m[3] ?? '';
    const targets = who.includes('a') ? 'ugo' : who;
    let bits = 0;
    for (const p of perms) {
      for (const t of targets) {
        const shift = t === 'u' ? 6 : t === 'g' ? 3 : 0;
        if (p === 'r') bits |= 4 << shift;
        if (p === 'w') bits |= 2 << shift;
        if (p === 'x' || (p === 'X' && (isDir || (current & 0o111) !== 0))) bits |= 1 << shift;
        if (p === 's' && t === 'u') bits |= 0o4000;
        if (p === 's' && t === 'g') bits |= 0o2000;
      }
      if (p === 't') bits |= 0o1000;
    }
    // Sans destinataire (« +x »), le umask s'applique comme pour une création.
    if (!m[1]) bits &= ~umask | 0o7000;
    const clear =
      targets.split('').reduce((acc, t) => acc | (0o7 << (t === 'u' ? 6 : t === 'g' ? 3 : 0)), 0) |
      (targets.includes('u') ? 0o4000 : 0) |
      (targets.includes('g') ? 0o2000 : 0) |
      (targets.includes('o') ? 0o1000 : 0);
    if (op === '+') mode |= bits;
    else if (op === '-') mode &= ~bits;
    else mode = (mode & ~clear) | bits;
  }
  return mode;
}

/** Applique une modification à un chemin (et à son contenu en récursif). */
function forEachTarget(
  env: CommandEnv,
  operand: string,
  recursive: boolean,
  action: (
    machine: Machine,
    path: string,
    node: FsNode,
    shown: string,
  ) => { machine?: Machine; error?: string },
): { machine: Machine; errors: string[] } {
  let machine = env.machine;
  const errors: string[] = [];
  const found = statPath(machine, env.resolve(operand), env.user);
  if (!found.ok)
    return { machine, errors: [`impossible d'accéder à '${operand}': ${strerror(found.error)}`] };
  const paths = [
    found.value.path,
    ...(recursive && found.value.node.type === 'dir'
      ? Object.keys(machine.fs)
          .filter((p) => p !== found.value.path && isInside(p, found.value.path))
          .sort()
      : []),
  ];
  for (const path of paths) {
    const node = machine.fs[path];
    if (!node) continue;
    const shown =
      path === found.value.path
        ? operand
        : operand.replace(/\/$/, '') + path.slice(found.value.path.length);
    const result = action(machine, path, node, shown);
    if (result.error) errors.push(result.error);
    if (result.machine) machine = result.machine;
  }
  return { machine, errors };
}

/** Commande `chmod` : change les droits. */
export const chmod: BashCommand = {
  name: 'chmod',
  summary: "change les droits d'accès",
  manual: `NOM
       chmod - changer les droits d'accès

SYNOPSIS
       chmod [-R] [-v] MODE FICHIER...

DESCRIPTION
       Seul le propriétaire (ou root) peut changer les droits d'un fichier.

       Octal : r=4 w=2 x=1, pour propriétaire, groupe, autres.
         chmod 640 f      rw- r-- ---
         chmod 2775 dir   setgid : les fichiers créés héritent du groupe
         chmod 1777 dir   sticky bit : on ne supprime que ses fichiers
       Symbolique : u g o a, + - =, r w x s t
         chmod u+x script.sh      chmod g-w,o= rapport.txt

       -R     récursif             -v     afficher chaque changement`,
  run(args, env) {
    const flags = args.filter((a) => /^-[Rvc]+$/.test(a)).join('');
    const rest = args.filter((a) => !/^-[Rvc]+$/.test(a));
    const [spec, ...operands] = rest;
    if (spec === undefined) return { stderr: missingOperand('chmod'), exitCode: 1 };
    if (operands.length === 0)
      return {
        stderr: `chmod: opérande manquant après '${spec}'\nSaisissez « chmod --help » pour plus d'informations.\n`,
        exitCode: 1,
      };
    if (applyMode(spec, 0, false) === null)
      return {
        stderr: `chmod: mode incorrect : « ${spec} »\nSaisissez « chmod --help » pour plus d'informations.\n`,
        exitCode: 1,
      };
    let stdout = '';
    let machine = env.machine;
    const errors: string[] = [];
    for (const operand of operands) {
      const result = forEachTarget(
        { ...env, machine },
        operand,
        flags.includes('R'),
        (m, path, node, shown) => {
          if (node.type === 'symlink') return {};
          if (env.user !== 'root' && node.owner !== env.user)
            return { error: `modification des droits de '${shown}': ${strerror('EPERM')}` };
          const mode =
            applyMode(spec, node.mode, node.type === 'dir', env.machine.session.umask ?? 0o022) ??
            node.mode;
          if (flags.includes('v') || (flags.includes('c') && mode !== node.mode)) {
            const next = { ...node, mode };
            stdout +=
              mode === (node.mode & 0o7777)
                ? `mode de '${shown}' conservé à ${(mode & 0o7777).toString(8).padStart(4, '0')} (${modeString(node).slice(1)})\n`
                : `mode de '${shown}' changé de ${(node.mode & 0o7777).toString(8).padStart(4, '0')} (${modeString(node).slice(1)}) en ${mode.toString(8).padStart(4, '0')} (${modeString(next).slice(1)})\n`;
          }
          return { machine: setNode(m, path, { ...node, mode }) };
        },
      );
      machine = result.machine;
      errors.push(...result.errors);
    }
    return {
      machine,
      stdout,
      stderr: errors.map((e) => `chmod: ${e}\n`).join(''),
      exitCode: errors.length ? 1 : 0,
    };
  },
};

/** Commande `chown` : change le propriétaire (root seulement). */
export const chown: BashCommand = {
  name: 'chown',
  summary: 'change le propriétaire et le groupe',
  manual: `NOM
       chown - changer le propriétaire d'un fichier

SYNOPSIS
       chown [-R] PROPRIÉTAIRE[:GROUPE] FICHIER...

DESCRIPTION
       Seul root peut donner un fichier à un autre compte.

EXEMPLES
       sudo chown -R www-data:www-data /var/www/intranet
       sudo chown julie: rapport.txt     (groupe principal de julie)`,
  run(args, env) {
    const recursive = args.some((a) => /^-[Rv]*R/.test(a));
    const rest = args.filter((a) => !/^-[Rvc]+$/.test(a));
    const [spec, ...operands] = rest;
    if (spec === undefined) return { stderr: missingOperand('chown'), exitCode: 1 };
    if (operands.length === 0)
      return {
        stderr: `chown: opérande manquant après '${spec}'\nSaisissez « chown --help » pour plus d'informations.\n`,
        exitCode: 1,
      };
    const [ownerPart = '', groupPart] = spec.split(/[:.]/, 2);
    if (ownerPart && !env.machine.users[ownerPart])
      return { stderr: `chown: utilisateur incorrect: « ${spec} »\n`, exitCode: 1 };
    const group = groupPart === '' ? env.machine.users[ownerPart]?.group : groupPart;
    if (group !== undefined && !env.machine.groups[group])
      return { stderr: `chown: groupe incorrect: « ${spec} »\n`, exitCode: 1 };
    let machine = env.machine;
    const errors: string[] = [];
    for (const operand of operands) {
      const result = forEachTarget(
        { ...env, machine },
        operand,
        recursive,
        (m, path, node, shown) => {
          if (env.user !== 'root' && ownerPart !== '' && ownerPart !== node.owner)
            return { error: `modification du propriétaire de '${shown}': ${strerror('EPERM')}` };
          if (
            env.user !== 'root' &&
            group !== undefined &&
            (node.owner !== env.user || !userGroups(m, env.user).includes(group))
          )
            return { error: `modification du groupe de '${shown}': ${strerror('EPERM')}` };
          return {
            machine: setNode(m, path, {
              ...node,
              owner: ownerPart || node.owner,
              group: group ?? node.group,
            }),
          };
        },
      );
      machine = result.machine;
      errors.push(...result.errors);
    }
    return {
      machine,
      stderr: errors.map((e) => `chown: ${e}\n`).join(''),
      exitCode: errors.length ? 1 : 0,
    };
  },
};

/** Commande `chgrp` : change le groupe. */
export const chgrp: BashCommand = {
  name: 'chgrp',
  summary: "change le groupe d'un fichier",
  manual: `NOM
       chgrp - changer le groupe d'un fichier

SYNOPSIS
       chgrp [-R] GROUPE FICHIER...

DESCRIPTION
       Le propriétaire peut donner le fichier à un groupe dont il est membre ;
       root, à n'importe quel groupe.`,
  run(args, env) {
    const recursive = args.some((a) => /^-[Rv]*R/.test(a));
    const rest = args.filter((a) => !/^-[Rvc]+$/.test(a));
    const [group, ...operands] = rest;
    if (group === undefined) return { stderr: missingOperand('chgrp'), exitCode: 1 };
    if (operands.length === 0)
      return {
        stderr: `chgrp: opérande manquant après '${group}'\nSaisissez « chgrp --help » pour plus d'informations.\n`,
        exitCode: 1,
      };
    if (!env.machine.groups[group])
      return { stderr: `chgrp: groupe incorrect: « ${group} »\n`, exitCode: 1 };
    let machine = env.machine;
    const errors: string[] = [];
    for (const operand of operands) {
      const result = forEachTarget(
        { ...env, machine },
        operand,
        recursive,
        (m, path, node, shown) => {
          if (
            env.user !== 'root' &&
            (node.owner !== env.user || !userGroups(m, env.user).includes(group))
          )
            return { error: `modification du groupe de '${shown}': ${strerror('EPERM')}` };
          return { machine: setNode(m, path, { ...node, group }) };
        },
      );
      machine = result.machine;
      errors.push(...result.errors);
    }
    return {
      machine,
      stderr: errors.map((e) => `chgrp: ${e}\n`).join(''),
      exitCode: errors.length ? 1 : 0,
    };
  },
};

/** Commande interne `umask` : masque de création des fichiers. */
export const umask: BashCommand = {
  name: 'umask',
  builtin: true,
  summary: 'affiche ou change le masque de création des fichiers',
  manual: `NOM
       umask - masque des droits à la création

SYNOPSIS
       umask [-S] [MASQUE]

DESCRIPTION
       Les droits d'un nouveau fichier valent 666 moins le masque (777 pour un
       dossier). Avec umask 022 : fichiers 644, dossiers 755. Avec 027 :
       fichiers 640, dossiers 750 (rien pour les autres).`,
  run(args, env) {
    const current = env.machine.session.umask ?? 0o022;
    const value = args.find((a) => !a.startsWith('-'));
    if (value === undefined) {
      if (args.includes('-S')) {
        const part = (shift: number) =>
          ['r', 'w', 'x'].filter((_, i) => ((~current >> shift) & (4 >> i)) !== 0).join('');
        return { stdout: `u=${part(6)},g=${part(3)},o=${part(0)}\n`, exitCode: 0 };
      }
      return { stdout: `${current.toString(8).padStart(4, '0')}\n`, exitCode: 0 };
    }
    if (!/^[0-7]{1,4}$/.test(value))
      return { stderr: `bash: umask: ${value} : nombre octal hors plage\n`, exitCode: 1 };
    return {
      exitCode: 0,
      machine: { ...env.machine, session: { ...env.machine.session, umask: parseInt(value, 8) } },
    };
  },
};
