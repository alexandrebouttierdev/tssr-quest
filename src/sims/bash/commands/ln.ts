import { statPath, setNode } from '@sims/shared/fs';
import { basename, dirname, joinPath } from '@sims/shared/path';
import { canAccess, userGroups } from '@sims/shared/permissions';
import type { BashCommand } from '../command';
import { parseOptions } from '../options';
import { fsError, missingOperand } from './helpers';

/** Commande `ln` : crée des liens (symboliques avec -s). */
export const ln: BashCommand = {
  name: 'ln',
  summary: 'crée des liens entre fichiers',
  manual: `NOM
       ln - créer des liens entre fichiers

SYNOPSIS
       ln [-s] [-f] CIBLE [NOM_DU_LIEN]

DESCRIPTION
       Crée un lien vers CIBLE. Sans -s, un lien physique (même contenu, même
       inœud) ; avec -s, un lien symbolique (un raccourci qui contient le
       chemin de la cible, et qui casse si la cible disparaît).

       -s     lien symbolique
       -f     remplacer le lien s'il existe déjà

EXEMPLES
       ln -s /etc/apache2/sites-available/intranet.conf /etc/apache2/sites-enabled/`,
  run(args, env) {
    const parsed = parseOptions(args, {
      name: 'ln',
      short: 'sfv',
      long: { symbolic: 's', force: 'f', verbose: 'v' },
    });
    if (!parsed.ok) return { stderr: parsed.message, exitCode: 1 };
    const [target, linkName] = parsed.operands;
    if (target === undefined)
      return { stderr: missingOperand('ln', 'opérande de fichier manquant'), exitCode: 1 };
    const symbolic = parsed.flags.has('s');
    const now = env.ctx.now.getTime();
    let linkPath = env.resolve(linkName ?? basename(target));
    const asDir = statPath(env.machine, linkPath, env.user);
    if (asDir.ok && asDir.value.node.type === 'dir' && linkName !== undefined)
      linkPath = joinPath(asDir.value.path, basename(target));
    const shownLink = linkName ?? basename(target);
    const kind = symbolic
      ? 'impossible de créer le lien symbolique'
      : 'impossible de créer le lien physique';
    if (env.machine.fs[linkPath] && !parsed.flags.has('f'))
      return { stderr: fsError('ln', kind, shownLink, 'EEXIST'), exitCode: 1 };
    const parent = statPath(env.machine, dirname(linkPath), env.user);
    if (!parent.ok) return { stderr: fsError('ln', kind, shownLink, parent.error), exitCode: 1 };
    if (!canAccess(env.machine, env.user, parent.value.node, 'write'))
      return { stderr: fsError('ln', kind, shownLink, 'EACCES'), exitCode: 1 };
    const group = userGroups(env.machine, env.user)[0] ?? env.user;
    if (symbolic) {
      return {
        exitCode: 0,
        machine: setNode(env.machine, linkPath, {
          type: 'symlink',
          owner: env.user,
          group,
          mode: 0o777,
          mtime: now,
          target,
        }),
      };
    }
    const source = statPath(env.machine, env.resolve(target), env.user);
    if (!source.ok)
      return { stderr: fsError('ln', "impossible d'accéder à", target, source.error), exitCode: 1 };
    if (source.value.node.type === 'dir')
      return {
        stderr: `ln: '${target}': lien physique non permis vers un répertoire\n`,
        exitCode: 1,
      };
    // Lien physique simplifié : une copie qui garde propriétaire, droits et taille (pas d'inœud partagé).
    return { exitCode: 0, machine: setNode(env.machine, linkPath, source.value.node) };
  },
};
