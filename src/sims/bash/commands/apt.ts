import { PACKAGE_CATALOG, packageFiles } from '@sims/shared/package-catalog';
import {
  applyPlan,
  aptSize,
  aptUpdate,
  archiveLabel,
  candidateSuite,
  candidateVersion,
  configurePending,
  describePlan,
  DPKG_INTERRUPTED,
  dpkgInterrupted,
  encodePlan,
  planAutoremove,
  planInstall,
  planIsEmpty,
  planNeedsConfirmation,
  planRemove,
  planUpgrade,
  type AptPlan,
  type PlanError,
} from '@sims/shared/packages';
import type { PackageState } from '@sims/shared/types';
import type { BashCommand, CommandEnv, CommandOutcome } from '../command';
import { globToRegExp } from '../glob';
import { withPending } from '../pending';

/** En-tête commun aux opérations qui lisent la base APT. */
const READING =
  "Lecture des listes de paquets... Fait\nConstruction de l'arbre des dépendances... Fait\nLecture des informations d'état... Fait\n";

/** Erreurs d'APT lancé sans les droits root, selon le verrou visé. */
const LOCK_ERRORS = {
  lists:
    "E: Impossible d'ouvrir le fichier verrou /var/lib/apt/lists/lock - open (13: Permission non accordée)\nE: Impossible de verrouiller le répertoire /var/lib/apt/lists/\n",
  dpkg: "E: Impossible d'ouvrir le fichier verrou /var/lib/dpkg/lock-frontend - open (13: Permission non accordée)\nE: Impossible d'obtenir le verrou de dpkg (/var/lib/dpkg/lock-frontend). Avez-vous les droits du superutilisateur ?\n",
};

/** Avertissement d'apt quand sa sortie part dans un tube ou un fichier. */
const CLI_WARNING =
  '\nWARNING: apt does not have a stable CLI interface. Use with caution in scripts.\n\n';

/** Options reconnues par apt et apt-get. */
interface AptOptions {
  readonly yes: boolean;
  readonly purge: boolean;
  readonly installed: boolean;
  readonly upgradable: boolean;
  readonly operands: readonly string[];
}

/** Sépare options et opérandes ; renvoie un message pour une option inconnue. */
function parseAptArgs(args: readonly string[]): AptOptions | string {
  let yes = false;
  let purge = false;
  let installed = false;
  let upgradable = false;
  const operands: string[] = [];
  for (const arg of args) {
    if (!arg.startsWith('-') || arg === '-') {
      operands.push(arg);
      continue;
    }
    if (['-y', '--yes', '--assume-yes', '-qy', '-yq'].includes(arg)) yes = true;
    else if (arg === '--purge') purge = true;
    else if (arg === '--installed') installed = true;
    else if (arg === '--upgradable') upgradable = true;
    else if (
      ['-q', '-qq', '--quiet', '--no-install-recommends', '--fix-broken', '-f'].includes(arg)
    ) {
      continue;
    } else {
      return `E: L'option de ligne de commande « ${arg.replace(/^-+/, '')} » [de ${arg}] n'est pas comprise avec les autres options.\n`;
    }
  }
  return { yes, purge, installed, upgradable, operands };
}

/** Ligne de commande telle qu'elle apparaît dans /var/log/apt/history.log. */
function commandLine(frontend: string, args: readonly string[]): string {
  return [frontend, ...args].join(' ');
}

/** Compte à l'origine de la commande (celui qui a tapé `sudo`). */
function requester(env: CommandEnv): string {
  return env.machine.session.user;
}

/**
 * Affiche un plan puis l'applique, ou pose la question « Souhaitez-vous continuer ? ».
 */
function runPlan(
  env: CommandEnv,
  plan: AptPlan | PlanError,
  header: string,
  yes: boolean,
): CommandOutcome {
  if ('error' in plan) return { stdout: header, stderr: plan.error, exitCode: 100 };
  const summary = header + describePlan(env.machine, plan);
  if (planIsEmpty(plan)) return { stdout: summary, exitCode: 0 };
  if (planNeedsConfirmation(plan) && !yes) {
    return {
      stdout: summary,
      exitCode: 0,
      machine: withPending(env.machine, {
        kind: 'apt-confirm',
        prompt: 'Souhaitez-vous continuer ? [O/n] ',
        secret: false,
        data: encodePlan(plan),
      }),
    };
  }
  const applied = applyPlan(env.machine, plan, env.ctx.now.getTime());
  return { stdout: summary + applied.stdout, exitCode: 0, machine: applied.machine };
}

/** Étiquette d'état affichée par `apt list` et `apt search`. */
function listFlag(p: PackageState): string {
  if (!p.installed) return '';
  if (p.update && p.updateListed) return ` [pouvant être mis à jour depuis : ${p.version}]`;
  return p.auto ? ' [installé, automatique]' : ' [installé]';
}

/** Une ligne de `apt list`. */
function listLine(p: PackageState): string {
  const now = p.installed && !(p.update && p.updateListed) ? ',now' : '';
  return `${p.name}/${archiveLabel(p)}${now} ${candidateVersion(p)} amd64${listFlag(p)}\n`;
}

/** `apt list` : paquets, filtrés par motif et par état. */
function aptList(env: CommandEnv, options: AptOptions): CommandOutcome {
  const patterns = options.operands.slice(1).map((p) => globToRegExp(p));
  const packages = Object.values(env.machine.packages)
    .filter((p) => patterns.length === 0 || patterns.some((re) => re.test(p.name)))
    .filter((p) => !options.installed || p.installed)
    .filter((p) => !options.upgradable || (p.installed && p.update && p.updateListed))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return {
    stdout: `En train de lister... Fait\n${packages.map(listLine).join('')}`,
    // Dans un tube, apt rappelle que son affichage peut changer : apt-get convient aux scripts.
    stderr: env.isTerminal ? '' : CLI_WARNING,
    exitCode: 0,
  };
}

/** `apt search` : recherche dans les noms et les descriptions. */
function aptSearch(env: CommandEnv, terms: readonly string[]): CommandOutcome {
  if (terms.length === 0)
    return { stderr: 'E: Vous devez fournir au moins un motif de recherche\n', exitCode: 100 };
  const res = terms.map(
    (t) => new RegExp(t.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*'), 'i'),
  );
  const found = Object.values(env.machine.packages)
    .filter((p) => res.every((re) => re.test(p.name) || re.test(p.description)))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return {
    stdout: `En train de trier... Fait\nRecherche en texte intégral... Fait\n${found
      .map(
        (p) =>
          `${p.name}/${archiveLabel(p)} ${candidateVersion(p)} amd64${listFlag(p)}\n  ${p.description}\n\n`,
      )
      .join('')}`,
    exitCode: 0,
  };
}

/** Adresse du dépôt d'une suite, telle qu'APT l'affiche. */
function sourceLine(p: PackageState): string {
  const suite = candidateSuite(p);
  const uri =
    suite === 'bookworm-security'
      ? 'http://security.debian.org/debian-security'
      : 'http://deb.debian.org/debian';
  return `${uri} ${suite}/main amd64 Packages`;
}

/** `apt show` : fiche d'un paquet (champs en anglais, comme sur Debian). */
function aptShow(env: CommandEnv, names: readonly string[]): CommandOutcome {
  let stdout = '';
  let stderr = '';
  for (const name of names) {
    const p = env.machine.packages[name];
    const def = PACKAGE_CATALOG[name];
    if (!p || !def) {
      stderr += `N: Impossible de trouver le paquet ${name}\n`;
      continue;
    }
    stdout += `Package: ${name}\nVersion: ${candidateVersion(p)}\nPriority: ${def.priority}\n${def.essential ? 'Essential: yes\n' : ''}Section: ${def.section}\nInstalled-Size: ${aptSize(def.installedSize * 1024, 'B')}\n`;
    if (def.depends.length > 0) stdout += `Depends: ${def.depends.join(', ')}\n`;
    stdout += `Download-Size: ${aptSize(def.downloadSize, 'B')}\n`;
    if (p.installed) stdout += `APT-Manual-Installed: ${p.auto ? 'no' : 'yes'}\n`;
    stdout += `APT-Sources: ${sourceLine(p)}\nDescription: ${p.description}\n\n`;
  }
  if (stderr && !stdout) stderr += "E: Aucun paquet n'a été trouvé\n";
  return { stdout, stderr, exitCode: stdout ? 0 : 100 };
}

/** `apt policy` : version installée, candidate et origine. */
function aptPolicy(env: CommandEnv, names: readonly string[]): CommandOutcome {
  let stdout = '';
  for (const name of names) {
    const p = env.machine.packages[name];
    if (!p) continue;
    const candidate = candidateVersion(p);
    stdout += `${name}:\n  Installé : ${p.installed ? p.version : '(aucun)'}\n  Candidat : ${candidate}\n Table de version :\n`;
    if (candidate !== p.version) {
      stdout += `     ${candidate} 500\n        500 ${sourceLine(p)}\n`;
      if (p.installed) stdout += ` *** ${p.version} 100\n        100 /var/lib/dpkg/status\n`;
    } else {
      stdout += `${p.installed ? ' *** ' : '     '}${p.version} 500\n        500 ${sourceLine(p)}\n`;
      if (p.installed) stdout += '        100 /var/lib/dpkg/status\n';
    }
  }
  return { stdout, exitCode: 0 };
}

/** Texte d'aide affiché par `apt` sans argument. */
const APT_USAGE = `apt 2.6.1 (amd64)
Utilisation : apt [options] commande

apt est un gestionnaire de paquets en ligne de commande. Il fournit les
commandes pour la recherche et la gestion ainsi que pour l'interrogation
d'informations sur les paquets.

Commandes les plus utilisées :
  list - lister les paquets en fonction de leur nom
  search - chercher dans les descriptions des paquets
  show - afficher les détails du paquet
  install - installer des paquets
  remove - supprimer des paquets
  autoremove - supprimer automatiquement tous les paquets inutilisés
  update - mettre à jour la liste des paquets disponibles
  upgrade - mettre à niveau le système en installant/mettant à niveau les paquets
  full-upgrade - mettre à niveau le système en supprimant/installant/mettant à niveau les paquets
`;

/**
 * Exécute apt ou apt-get.
 *
 * @param frontend - Programme appelé.
 * @param args - Arguments.
 * @param env - Environnement d'exécution.
 * @returns Le résultat de l'opération.
 */
function runApt(
  frontend: 'apt' | 'apt-get',
  args: readonly string[],
  env: CommandEnv,
): CommandOutcome {
  const parsed = parseAptArgs(args);
  if (typeof parsed === 'string') return { stderr: parsed, exitCode: 100 };
  const [action, ...names] = parsed.operands;
  if (action === undefined) {
    return frontend === 'apt'
      ? { stdout: APT_USAGE, exitCode: 1 }
      : { stdout: 'apt 2.6.1 (amd64)\nUtilisation : apt-get [options] commande\n', exitCode: 1 };
  }
  const root = env.user === 'root';
  const line = commandLine(frontend, args);
  const readOnly = frontend === 'apt' && ['list', 'search', 'show', 'policy'].includes(action);
  if (readOnly) {
    if (action === 'list') return aptList(env, parsed);
    if (action === 'search') return aptSearch(env, names);
    if (action === 'show') return aptShow(env, names);
    return aptPolicy(env, names);
  }
  if (action === 'update') {
    if (!root)
      return {
        stdout: 'Lecture des listes de paquets... Fait\n',
        stderr: LOCK_ERRORS.lists,
        exitCode: 100,
      };
    return aptUpdate(env.machine, frontend);
  }
  const writes: Record<string, true> = {
    install: true,
    reinstall: true,
    remove: true,
    purge: true,
    upgrade: true,
    'full-upgrade': true,
    'dist-upgrade': true,
    autoremove: true,
    clean: true,
  };
  const valid =
    Object.hasOwn(writes, action) &&
    !(frontend === 'apt' && action === 'dist-upgrade') &&
    !(frontend === 'apt-get' && action === 'full-upgrade');
  if (!valid) return { stderr: `E: Opération ${action} non valable\n`, exitCode: 100 };
  if (!root) return { stderr: LOCK_ERRORS.dpkg, exitCode: 100 };
  if (action === 'clean') return { exitCode: 0 };
  if (dpkgInterrupted(env.machine)) return { stderr: DPKG_INTERRUPTED, exitCode: 100 };
  const by = requester(env);
  if (action === 'install' || action === 'reinstall') {
    return runPlan(env, planInstall(env.machine, names, line, by), READING, parsed.yes);
  }
  if (action === 'remove' || action === 'purge') {
    return runPlan(
      env,
      planRemove(env.machine, names, action === 'purge' || parsed.purge, line, by),
      READING,
      parsed.yes,
    );
  }
  if (action === 'autoremove') {
    return runPlan(env, planAutoremove(env.machine, parsed.purge, line, by), READING, parsed.yes);
  }
  return runPlan(
    env,
    planUpgrade(env.machine, line, by),
    `${READING}Calcul de la mise à jour... Fait\n`,
    parsed.yes,
  );
}

/** Commande `apt` : gestionnaire de paquets. */
export const apt: BashCommand = {
  name: 'apt',
  summary: 'gestionnaire de paquets en ligne de commande',
  package: 'apt',
  manual: `NOM
       apt - gestionnaire de paquets en ligne de commande

SYNOPSIS
       apt [OPTIONS] COMMANDE [PAQUET]...

DESCRIPTION
       Installe, met à jour et supprime les logiciels depuis les dépôts
       déclarés dans /etc/apt/sources.list. Les opérations qui modifient le
       système demandent les droits root (sudo).

       update        télécharge les listes de paquets des dépôts
       upgrade       installe les mises à jour disponibles
       full-upgrade  comme upgrade, en acceptant d'enlever des paquets
       install P     installe un paquet et ses dépendances
       remove P      enlève un paquet (sa configuration reste)
       purge P       enlève un paquet et sa configuration
       autoremove    enlève les dépendances devenues inutiles
       list          liste les paquets (--installed, --upgradable)
       search MOT    cherche dans les noms et les descriptions
       show P        affiche la fiche d'un paquet
       policy P      versions installée et candidate

       -y     répondre oui à la question de confirmation

EXEMPLES
       sudo apt update && sudo apt upgrade
       apt list --upgradable
       sudo apt install apache2`,
  run: (args, env) => runApt('apt', args, env),
};

/** Commande `apt-get` : interface historique d'APT, stable pour les scripts. */
export const aptGet: BashCommand = {
  name: 'apt-get',
  summary: 'outil de gestion des paquets APT (interface pour les scripts)',
  package: 'apt',
  manual: `NOM
       apt-get - outil de gestion des paquets APT

SYNOPSIS
       apt-get [OPTIONS] COMMANDE [PAQUET]...

DESCRIPTION
       Interface historique d'APT, à privilégier dans les scripts. Mêmes
       opérations que apt (update, upgrade, dist-upgrade, install, remove,
       purge, autoremove, clean) ; la recherche se fait avec apt-cache.

       -y     répondre oui à la question de confirmation

EXEMPLES
       sudo apt-get update
       sudo apt-get install -y rsync`,
  run: (args, env) => runApt('apt-get', args, env),
};

/** Code d'état de dpkg -l : souhait puis état. */
function dpkgStatus(p: PackageState): string {
  if (p.halfConfigured) return 'iF';
  if (p.installed) return 'ii';
  return p.configRemains ? 'rc' : 'un';
}

/** Paquets connus de dpkg (installés ou dont la configuration reste). */
function known(p: PackageState | undefined): p is PackageState {
  return p !== undefined && (p.installed || p.configRemains === true || p.halfConfigured === true);
}

/** `dpkg -l` : tableau des paquets. */
function dpkgList(env: CommandEnv, patterns: readonly string[]): CommandOutcome {
  const all = Object.values(env.machine.packages).sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  );
  let rows: PackageState[];
  let stderr = '';
  if (patterns.length === 0) {
    rows = all.filter(known);
  } else {
    rows = [];
    for (const pattern of patterns) {
      const re = globToRegExp(pattern);
      const hits = all.filter((p) => re.test(p.name) && known(p));
      if (hits.length === 0) stderr += `dpkg-query: aucun paquet ne correspond à ${pattern}\n`;
      rows.push(...hits.filter((h) => !rows.includes(h)));
    }
  }
  if (rows.length === 0) return { stderr, exitCode: 1 };
  const nameWidth = Math.max(14, ...rows.map((p) => p.name.length));
  const versionWidth = Math.max(15, ...rows.map((p) => p.version.length));
  const archWidth = 12;
  const descWidth = Math.max(10, 80 - (4 + nameWidth + 1 + versionWidth + 1 + archWidth + 1));
  const pad = (text: string, width: number) => text.padEnd(width);
  let stdout =
    'Souhait=inconnU/Installé/suppRimé/Purgé/H=à garder\n' +
    '| État=Non/Installé/fichier-Config/dépaqUeté/échec-conFig/H=semi-installé/W=attend-traitement-déclenchements\n' +
    '|/ Err?=(aucune)/besoin Réinstallation (État,Err: majuscule=mauvais)\n' +
    `||/ ${pad('Nom', nameWidth)} ${pad('Version', versionWidth)} ${pad('Architecture', archWidth)} Description\n` +
    `+++-${'='.repeat(nameWidth)}-${'='.repeat(versionWidth)}-${'='.repeat(archWidth)}-${'='.repeat(descWidth)}\n`;
  for (const p of rows) {
    stdout += `${dpkgStatus(p)}  ${pad(p.name, nameWidth)} ${pad(p.version, versionWidth)} ${pad('amd64', archWidth)} ${p.description.slice(0, descWidth)}\n`;
  }
  return { stdout, stderr, exitCode: stderr ? 1 : 0 };
}

/** `dpkg -L` : fichiers installés par un paquet. */
function dpkgFiles(env: CommandEnv, names: readonly string[]): CommandOutcome {
  let stdout = '';
  let stderr = '';
  for (const name of names) {
    const p = env.machine.packages[name];
    const def = PACKAGE_CATALOG[name];
    if (!p?.installed || !def) {
      stderr += `dpkg-query: le paquet « ${name} » n'est pas installé\nUtilisez dpkg --contents (= dpkg-deb --contents) pour lister le contenu des fichiers d'archive.\n`;
      continue;
    }
    const paths = new Set<string>(['/.']);
    for (const f of packageFiles(def)) {
      const parts = f.path.split('/').filter(Boolean);
      for (let i = 1; i < parts.length; i++) paths.add(`/${parts.slice(0, i).join('/')}`);
      paths.add(f.path);
    }
    stdout += `${[...paths].join('\n')}\n`;
  }
  return { stdout, stderr, exitCode: stderr ? 1 : 0 };
}

/** `dpkg -s` : état détaillé d'un paquet. */
function dpkgShow(env: CommandEnv, names: readonly string[]): CommandOutcome {
  const blocks: string[] = [];
  let stderr = '';
  for (const name of names) {
    const p = env.machine.packages[name];
    const def = PACKAGE_CATALOG[name];
    if (!known(p) || !def) {
      stderr += `dpkg-query: le paquet « ${name} » n'est pas installé et aucune information n'est disponible\nUtilisez dpkg --info (= dpkg-deb --info) pour examiner les fichiers d'archive.\n`;
      continue;
    }
    const status = p.halfConfigured
      ? 'install ok half-configured'
      : p.installed
        ? 'install ok installed'
        : 'deinstall ok config-files';
    blocks.push(
      `Package: ${name}\nStatus: ${status}\n${def.essential ? 'Essential: yes\n' : ''}Priority: ${def.priority}\nSection: ${def.section}\nInstalled-Size: ${def.installedSize}\nArchitecture: amd64\nVersion: ${p.version}\n${def.depends.length > 0 ? `Depends: ${def.depends.join(', ')}\n` : ''}Description: ${p.description}\n`,
    );
  }
  return { stdout: blocks.join('\n'), stderr, exitCode: stderr ? 1 : 0 };
}

/** `dpkg -S` : paquet qui a installé un fichier. */
function dpkgSearch(env: CommandEnv, patterns: readonly string[]): CommandOutcome {
  let stdout = '';
  let stderr = '';
  for (const pattern of patterns) {
    // Comme dpkg-query : motif shell sur le chemin complet ; sans « / » initial, il peut
    // apparaître n'importe où (`dpkg -S bin/curl`). Le `*` traverse les « / ».
    const body = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    const re = new RegExp(pattern.startsWith('/') ? `^${body}$` : body);
    const hits: string[] = [];
    for (const p of Object.values(env.machine.packages).sort((a, b) =>
      a.name.localeCompare(b.name, 'en'),
    )) {
      const def = PACKAGE_CATALOG[p.name];
      if (!p.installed || !def) continue;
      for (const f of packageFiles(def)) if (re.test(f.path)) hits.push(`${p.name}: ${f.path}`);
    }
    if (hits.length === 0)
      stderr += `dpkg-query: aucun chemin trouvé correspondant au motif ${pattern}\n`;
    stdout += hits.map((h) => `${h}\n`).join('');
  }
  return { stdout, stderr, exitCode: stderr ? 1 : 0 };
}

/** Message de dpkg sans action. */
const DPKG_USAGE_HINT = `
Utilisez « dpkg --help » pour obtenir de l'aide sur l'installation et la désinstallation des paquets [*] ;
Utilisez « apt » ou « aptitude » pour gérer les paquets de manière plus conviviale ;
`;

/** Commande `dpkg` : gestionnaire de paquets de bas niveau. */
export const dpkg: BashCommand = {
  name: 'dpkg',
  summary: 'gestionnaire de paquets de bas niveau de Debian',
  package: 'dpkg',
  manual: `NOM
       dpkg - gestionnaire de paquets de Debian (bas niveau)

SYNOPSIS
       dpkg ACTION [PAQUET]...

DESCRIPTION
       Interroge la base des paquets installés. Pour installer depuis les
       dépôts, on passe par apt, qui gère les dépendances.

       -l [MOTIF]      liste les paquets (ii = installé, rc = configuration restante)
       -L PAQUET       fichiers installés par le paquet
       -s PAQUET       état détaillé du paquet
       -S FICHIER      paquet qui a installé ce fichier
       -r PAQUET       enlève un paquet (-P : avec sa configuration)
       --configure -a  termine les installations interrompues

EXEMPLES
       dpkg -l | grep apache
       dpkg -S /usr/bin/curl
       sudo dpkg --configure -a`,
  run(args, env) {
    const [action, ...rest] = args;
    switch (action) {
      case '-l':
      case '--list':
        return dpkgList(env, rest);
      case '-L':
      case '--listfiles':
        return dpkgFiles(env, rest);
      case '-s':
      case '--status':
        return dpkgShow(env, rest);
      case '-S':
      case '--search':
        return dpkgSearch(env, rest);
      case '--configure': {
        if (env.user !== 'root') {
          return {
            stderr:
              "dpkg: erreur: l'opération demandée nécessite les privilèges du superutilisateur\n",
            exitCode: 2,
          };
        }
        if (rest[0] !== '-a' && rest[0] !== '--pending') {
          return {
            stderr: `dpkg: erreur: --configure a besoin d'au moins un paquet en argument\n${DPKG_USAGE_HINT}`,
            exitCode: 2,
          };
        }
        const result = configurePending(env.machine);
        return { machine: result.machine, stdout: result.stdout, exitCode: 0 };
      }
      case '-r':
      case '--remove':
      case '-P':
      case '--purge': {
        if (env.user !== 'root') {
          return {
            stderr:
              "dpkg: erreur: l'opération demandée nécessite les privilèges du superutilisateur\n",
            exitCode: 2,
          };
        }
        const purge = action === '-P' || action === '--purge';
        const plan = planRemove(env.machine, rest, purge, `dpkg ${args.join(' ')}`, requester(env));
        if ('error' in plan)
          return {
            stderr: plan.error.replace(
              /^E: Impossible de trouver le paquet (.*)$/gm,
              "dpkg: avertissement: le paquet $1 n'est pas installé, il n'est pas possible de le supprimer",
            ),
            exitCode: 1,
          };
        const blockers = plan.remove.filter((n) => !rest.includes(n));
        if (blockers.length > 0) {
          const target = rest[0] ?? '';
          return {
            stderr: `dpkg: problèmes de dépendances empêchant la suppression de ${target} :\n${blockers.map((b) => ` ${b} dépend de ${target}.\n`).join('')}\ndpkg: erreur de traitement du paquet ${target} (--remove) :\n problèmes de dépendances - non supprimé\nDes erreurs ont été rencontrées pendant l'exécution :\n ${target}\n`,
            exitCode: 1,
          };
        }
        const applied = applyPlan(env.machine, { ...plan, current: [] }, env.ctx.now.getTime());
        return {
          machine: applied.machine,
          stdout: applied.stdout.replace(/^Traitement des actions.*\n/m, ''),
          exitCode: 0,
        };
      }
      case undefined:
        return {
          stderr: `dpkg: erreur: il faut indiquer une action\n${DPKG_USAGE_HINT}`,
          exitCode: 2,
        };
      default:
        return {
          stderr: `dpkg: erreur: option inconnue ${action}\n${DPKG_USAGE_HINT}`,
          exitCode: 2,
        };
    }
  },
};
