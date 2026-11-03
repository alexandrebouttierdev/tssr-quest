/**
 * Gestion des paquets Debian simulée : sources APT, `apt update`, plans d'installation,
 * de mise à jour et de suppression, et leur application à la machine.
 *
 * Les textes produits reprennent la sortie française d'APT 2.6 et de dpkg 1.21
 * (Debian 12). Ce module ne dépend pas du shell : `apt`, `apt-get`, `dpkg` et la
 * confirmation « [O/n] » s'appuient tous sur lui.
 */

import { appendLogs } from './journal';
import { hasInternet } from './network';
import { dirname } from './path';
import {
  PACKAGE_CATALOG,
  packageFiles,
  SUITE_ARCHIVE,
  type PackageDefinition,
} from './package-catalog';
import { SERVICE_CATALOG } from './service-catalog';
import { serviceProcesses, startLogLines, stopService } from './services';
import { parisParts } from './time-format';
import type { AptSuite, FsNode, Machine, PackageState } from './types';

/** Ligne `deb` ou `deb-src` d'une liste de sources. */
export interface SourceEntry {
  readonly type: 'deb' | 'deb-src';
  /** URI sans barre finale (`http://deb.debian.org/debian`). */
  readonly uri: string;
  readonly suite: string;
  readonly components: readonly string[];
}

/** Résultat de la lecture des listes de sources. */
export type SourcesResult =
  | { readonly ok: true; readonly entries: readonly SourceEntry[] }
  | { readonly ok: false; readonly error: string };

/** Sortie d'une opération APT. */
export interface AptOutput {
  readonly machine: Machine;
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Plan calculé par APT avant confirmation. */
export interface AptPlan {
  /** Paquets demandés explicitement (affichés à part s'ils tirent des dépendances). */
  readonly requested: readonly string[];
  /** Nouveaux paquets, dans l'ordre d'installation (dépendances d'abord). */
  readonly install: readonly string[];
  /** Paquets mis à jour. */
  readonly upgrade: readonly string[];
  /** Paquets enlevés. */
  readonly remove: readonly string[];
  /** Suppression avec les fichiers de configuration. */
  readonly purge: boolean;
  /** Paquets déjà à jour (« est déjà la version la plus récente »). */
  readonly current: readonly string[];
  /** Paquets désormais marqués « installé manuellement ». */
  readonly manual: readonly string[];
  /** Ligne de commande (pour /var/log/apt/history.log). */
  readonly commandLine: string;
  /** Compte qui a lancé la commande (via sudo). */
  readonly requestedBy: string;
}

/** Sépare une liste encodée (`a b c`) ; chaîne vide → liste vide. */
function splitNames(text: string | undefined): string[] {
  return text ? text.split(' ').filter(Boolean) : [];
}

/**
 * Encode un plan dans les données d'une question en attente (chaînes uniquement).
 *
 * @param plan - Plan à mettre de côté le temps de la confirmation.
 * @returns Les champs texte.
 */
export function encodePlan(plan: AptPlan): Record<string, string> {
  return {
    requested: plan.requested.join(' '),
    install: plan.install.join(' '),
    upgrade: plan.upgrade.join(' '),
    remove: plan.remove.join(' '),
    purge: plan.purge ? 'true' : 'false',
    current: plan.current.join(' '),
    manual: plan.manual.join(' '),
    commandLine: plan.commandLine,
    requestedBy: plan.requestedBy,
  };
}

/**
 * Relit un plan encodé par `encodePlan`.
 *
 * @param data - Champs de la question en attente.
 * @returns Le plan.
 */
export function decodePlan(data: Readonly<Record<string, string>>): AptPlan {
  return {
    requested: splitNames(data['requested']),
    install: splitNames(data['install']),
    upgrade: splitNames(data['upgrade']),
    remove: splitNames(data['remove']),
    purge: data['purge'] === 'true',
    current: splitNames(data['current']),
    manual: splitNames(data['manual']),
    commandLine: data['commandLine'] ?? '',
    requestedBy: data['requestedBy'] ?? 'root',
  };
}

/** Hôtes des miroirs Debian connus et leur adresse (Fastly). */
const MIRROR_HOSTS: Readonly<Record<string, string>> = {
  'deb.debian.org': '151.101.130.132',
  'ftp.fr.debian.org': '212.27.32.66',
  'security.debian.org': '151.101.194.132',
};

/** Suites publiées par chaque chemin de miroir. */
const MIRROR_SUITES: Readonly<Record<string, readonly string[]>> = {
  '/debian': ['bookworm', 'bookworm-updates', 'bullseye', 'bullseye-updates', 'trixie'],
  '/debian-security': ['bookworm-security', 'bullseye-security', 'trixie-security'],
};

/** Taille des index téléchargés par suite (InRelease, Packages) en octets. */
const INDEX_SIZES: Readonly<Record<string, readonly [number, number]>> = {
  bookworm: [151_000, 8_788_000],
  'bookworm-updates': [55_400, 13_800],
  'bookworm-security': [48_000, 245_000],
};

/**
 * Taille au format d'APT (`SizeToStr`) : 4 chiffres significatifs au plus,
 * virgule décimale française.
 *
 * @param bytes - Taille en octets.
 * @param unit - Suffixe d'unité (`B` entre crochets, `o` dans les phrases).
 * @returns Par exemple `55,4 kB` ou `8 788 ko`.
 */
export function aptSize(bytes: number, unit: 'B' | 'o'): string {
  const prefixes = ['', 'k', 'M', 'G'];
  let value = bytes;
  let index = 0;
  while (value >= 10_000 && index < prefixes.length - 1) {
    value /= 1000;
    index++;
  }
  const text =
    value < 100 && index > 0
      ? value.toFixed(1).replace('.', ',')
      : String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${text} ${prefixes[index] ?? ''}${unit}`;
}

/** Contenu d'un fichier texte de la machine, ou `undefined`. */
function fileContent(machine: Machine, path: string): string | undefined {
  const node = machine.fs[path];
  return node?.type === 'file' ? node.content : undefined;
}

/**
 * Lit /etc/apt/sources.list et les fichiers `.list` de /etc/apt/sources.list.d.
 *
 * @param machine - Machine simulée.
 * @returns Les lignes actives, ou l'erreur d'APT sur la première ligne mal formée.
 */
export function readSources(machine: Machine): SourcesResult {
  const files = [
    '/etc/apt/sources.list',
    ...Object.keys(machine.fs)
      .filter((p) => p.startsWith('/etc/apt/sources.list.d/') && p.endsWith('.list'))
      .sort(),
  ];
  const entries: SourceEntry[] = [];
  for (const file of files) {
    const content = fileContent(machine, file);
    if (content === undefined) continue;
    for (const [index, raw] of content.split('\n').entries()) {
      const line = raw.replace(/#.*/, '').trim();
      if (!line) continue;
      const [type, ...rest] = line.split(/\s+/);
      // Les options entre crochets (`[arch=amd64 signed-by=…]`) ne changent rien ici.
      const words = rest.filter((w) => !w.startsWith('[') && !w.endsWith(']'));
      if (type !== 'deb' && type !== 'deb-src') {
        return {
          ok: false,
          error: `E: Type « ${type ?? ''} » inconnu sur la ligne ${index + 1} dans la liste des sources ${file}\nE: Les listes de sources ne peuvent être lues.\n`,
        };
      }
      const [uri, suite, ...components] = words;
      if (!uri || !suite) {
        return {
          ok: false,
          error: `E: Ligne ${index + 1} mal formée dans la liste des sources ${file} (${uri ? 'distribution' : 'URI'})\nE: Les listes de sources ne peuvent être lues.\n`,
        };
      }
      if (components.length === 0 && !suite.endsWith('/')) {
        return {
          ok: false,
          error: `E: Ligne ${index + 1} mal formée dans la liste des sources ${file} (composant)\nE: Les listes de sources ne peuvent être lues.\n`,
        };
      }
      entries.push({ type, uri: uri.replace(/\/+$/, ''), suite, components });
    }
  }
  return { ok: true, entries };
}

/** État d'un dépôt (URI + suite) au moment d'un `apt update`. */
type RepoStatus =
  | { readonly kind: 'ok'; readonly suite: AptSuite | null }
  | { readonly kind: 'no-network'; readonly host: string }
  | { readonly kind: 'unknown-host'; readonly host: string }
  | { readonly kind: 'not-found'; readonly host: string };

/** Évalue un dépôt : joignable, suite publiée, suite gérée par le simulateur. */
function repoStatus(machine: Machine, uri: string, suite: string): RepoStatus {
  const match = /^https?:\/\/([^/]+)(\/.*)?$/.exec(uri);
  const host = match?.[1] ?? uri;
  const path = match?.[2] ?? '/';
  if (!hasInternet(machine)) return { kind: 'no-network', host };
  if (!Object.hasOwn(MIRROR_HOSTS, host)) return { kind: 'unknown-host', host };
  const suites = MIRROR_SUITES[path] ?? [];
  if (!suites.includes(suite)) return { kind: 'not-found', host };
  const managed = (['bookworm', 'bookworm-updates', 'bookworm-security'] as const).find(
    (s) => s === suite,
  );
  return { kind: 'ok', suite: managed ?? null };
}

/**
 * Exécute `apt update` / `apt-get update` : télécharge les index des dépôts valides,
 * ce qui rend visibles les mises à jour publiées sur ces suites.
 *
 * @param machine - Machine simulée (la commande tourne en root).
 * @param frontend - `apt` ajoute le bilan des paquets à mettre à jour.
 * @returns La sortie, et le code 100 si une erreur bloque la mise à jour.
 */
export function aptUpdate(machine: Machine, frontend: 'apt' | 'apt-get'): AptOutput {
  const sources = readSources(machine);
  if (!sources.ok) return { machine, stdout: '', stderr: sources.error, exitCode: 100 };
  const repos = new Map<string, SourceEntry>();
  for (const entry of sources.entries) {
    const key = `${entry.uri} ${entry.suite}`;
    if (!repos.has(key)) repos.set(key, entry);
  }
  let stdout = '';
  let stderr = '';
  let failed = false;
  let received = 0;
  let counter = 0;
  const listed = new Set<AptSuite>();
  for (const entry of repos.values()) {
    counter++;
    const status = repoStatus(machine, entry.uri, entry.suite);
    const label = `${entry.uri} ${entry.suite}`;
    if (status.kind === 'no-network' || status.kind === 'unknown-host') {
      const reason =
        status.kind === 'no-network'
          ? `Échec temporaire de résolution de « ${status.host} »`
          : `Impossible de résoudre « ${status.host} »`;
      stdout += `Err :${counter} ${label} InRelease\n  ${reason}\n`;
      stderr += `W: Impossible de récupérer ${entry.uri}/dists/${entry.suite}/InRelease  ${reason}\n`;
      continue;
    }
    if (status.kind === 'not-found') {
      stdout += `Ign :${counter} ${label} InRelease\nErr :${++counter} ${label} Release\n  404  Not Found [IP : ${MIRROR_HOSTS[status.host] ?? ''} 80]\n`;
      stderr += `E: Le dépôt « ${label} Release » n'a pas de fichier Release.\nN: Les mises à jour depuis un tel dépôt ne peuvent s'effectuer de manière sécurisée, et sont donc désactivées par défaut.\nN: Voir les pages de manuel d'apt-secure(8) pour la création des dépôts et les détails de configuration d'un utilisateur.\n`;
      failed = true;
      continue;
    }
    const suite = status.suite;
    const hasMain = sources.entries.some(
      (e) =>
        e.type === 'deb' &&
        e.uri === entry.uri &&
        e.suite === entry.suite &&
        e.components.includes('main'),
    );
    const fresh =
      suite !== null &&
      hasMain &&
      Object.values(machine.packages).some((p) => p.update?.suite === suite && !p.updateListed);
    if (fresh) {
      const [release, packages] = INDEX_SIZES[suite] ?? [50_000, 100_000];
      stdout += `Réception de :${counter} ${label} InRelease [${aptSize(release, 'B')}]\n`;
      stdout += `Réception de :${++counter} ${entry.uri} ${entry.suite}/main amd64 Packages [${aptSize(packages, 'B')}]\n`;
      received += release + packages;
    } else {
      stdout += `Atteint :${counter} ${label} InRelease\n`;
    }
    if (suite !== null && hasMain) listed.add(suite);
  }
  if (received > 0) {
    stdout += `${aptSize(received, 'o')} réceptionnés en 1s (${aptSize(received, 'o')}/s)\n`;
  }
  stdout += 'Lecture des listes de paquets... Fait\n';
  const packages: Record<string, PackageState> = { ...machine.packages };
  for (const [name, p] of Object.entries(packages)) {
    if (p.update && listed.has(p.update.suite) && !p.updateListed) {
      packages[name] = { ...p, updateListed: true };
    }
  }
  const updated: Machine = { ...machine, packages };
  if (failed) stderr = stderr.replace(/^W: Impossible de récupérer certains.*\n/m, '');
  if (stderr.includes('W: Impossible de récupérer')) {
    stderr +=
      "W: Impossible de récupérer certains fichiers d'index, ils ont été ignorés, ou les anciens ont été utilisés à la place.\n";
  }
  if (frontend === 'apt' && !failed) {
    stdout +=
      "Construction de l'arbre des dépendances... Fait\nLecture des informations d'état... Fait\n";
    const count = upgradable(updated).length;
    stdout +=
      count === 0
        ? 'Tous les paquets sont à jour.\n'
        : count === 1
          ? '1 paquet peut être mis à jour. Exécutez « apt list --upgradable » pour le voir.\n'
          : `${count} paquets peuvent être mis à jour. Exécutez « apt list --upgradable » pour les voir.\n`;
  }
  return { machine: updated, stdout, stderr, exitCode: failed ? 100 : 0 };
}

/**
 * Paquets installés dont une mise à jour est connue des listes locales.
 *
 * @param machine - Machine simulée.
 * @returns Les noms triés.
 */
export function upgradable(machine: Machine): string[] {
  return Object.values(machine.packages)
    .filter((p) => p.installed && p.update && p.updateListed)
    .map((p) => p.name)
    .sort();
}

/** Version qu'installerait APT (la mise à jour si elle est connue). */
export function candidateVersion(p: PackageState): string {
  return p.update && p.updateListed ? p.update.version : p.version;
}

/** Suite d'où viendrait la version candidate. */
export function candidateSuite(p: PackageState): AptSuite {
  if (p.update && p.updateListed) return p.update.suite;
  return PACKAGE_CATALOG[p.name]?.suite ?? 'bookworm';
}

/** Vrai si dpkg a été interrompu (un paquet reste à configurer). */
export function dpkgInterrupted(machine: Machine): boolean {
  return Object.values(machine.packages).some((p) => p.halfConfigured);
}

/** Message d'APT quand dpkg a été interrompu. */
export const DPKG_INTERRUPTED =
  "E: dpkg a été interrompu. Il est nécessaire d'utiliser « sudo dpkg --configure -a » pour corriger le problème.\n";

/** Erreur de calcul d'un plan. */
export interface PlanError {
  readonly error: string;
}

/** Plan vide. */
function emptyPlan(commandLine: string, requestedBy: string): AptPlan {
  return {
    requested: [],
    install: [],
    upgrade: [],
    remove: [],
    purge: false,
    current: [],
    manual: [],
    commandLine,
    requestedBy,
  };
}

/**
 * Prépare `apt install` : dépendances absentes, mises à jour des paquets demandés.
 *
 * @param machine - Machine simulée.
 * @param names - Paquets demandés.
 * @param commandLine - Ligne de commande d'origine.
 * @param requestedBy - Compte à l'origine de la demande.
 * @returns Le plan, ou l'erreur « Impossible de trouver le paquet ».
 */
export function planInstall(
  machine: Machine,
  names: readonly string[],
  commandLine: string,
  requestedBy: string,
): AptPlan | PlanError {
  const missing = names.filter((n) => !machine.packages[n]);
  if (missing.length > 0) {
    return { error: missing.map((n) => `E: Impossible de trouver le paquet ${n}\n`).join('') };
  }
  const install: string[] = [];
  const upgrade: string[] = [];
  const current: string[] = [];
  const manual: string[] = [];
  const visit = (name: string, explicit: boolean): void => {
    const p = machine.packages[name];
    if (!p || install.includes(name)) return;
    if (p.installed) {
      if (!explicit) return;
      if (p.update && p.updateListed) upgrade.push(name);
      else current.push(name);
      if (p.auto) manual.push(name);
      return;
    }
    for (const dep of PACKAGE_CATALOG[name]?.depends ?? []) visit(dep, false);
    install.push(name);
  };
  for (const name of names) visit(name, true);
  return {
    ...emptyPlan(commandLine, requestedBy),
    requested: [...names],
    install,
    upgrade,
    current,
    manual,
  };
}

/**
 * Prépare `apt remove` / `apt purge` : les paquets qui dépendent des paquets enlevés
 * partent avec eux.
 *
 * @param machine - Machine simulée.
 * @param names - Paquets à enlever.
 * @param purge - Supprimer aussi la configuration.
 * @param commandLine - Ligne de commande d'origine.
 * @param requestedBy - Compte à l'origine de la demande.
 * @returns Le plan, ou une erreur (paquet inconnu, paquet essentiel).
 */
export function planRemove(
  machine: Machine,
  names: readonly string[],
  purge: boolean,
  commandLine: string,
  requestedBy: string,
): AptPlan | PlanError {
  const missing = names.filter((n) => !machine.packages[n]);
  if (missing.length > 0) {
    return { error: missing.map((n) => `E: Impossible de trouver le paquet ${n}\n`).join('') };
  }
  const remove = new Set<string>();
  const queue = names.filter(
    (n) => machine.packages[n]?.installed || (purge && machine.packages[n]?.configRemains),
  );
  while (queue.length > 0) {
    const name = queue.shift() ?? '';
    if (remove.has(name)) continue;
    remove.add(name);
    for (const p of Object.values(machine.packages)) {
      if (p.installed && PACKAGE_CATALOG[p.name]?.depends.includes(name)) queue.push(p.name);
    }
  }
  const essential = [...remove].filter((n) => PACKAGE_CATALOG[n]?.essential);
  if (essential.length > 0) {
    return {
      error: `ATTENTION : Les paquets essentiels suivants vont être enlevés.\nCELA NE DOIT PAS ÊTRE FAIT si vous ne savez pas exactement ce que vous faites !\n  ${essential.join(' ')}\nE: Ce n'est pas autorisé dans cette simulation : un système sans ${essential[0] ?? ''} ne démarre plus.\n`,
    };
  }
  return {
    ...emptyPlan(commandLine, requestedBy),
    requested: [...names],
    remove: [...remove].sort(),
    purge,
    current: names.filter((n) => !remove.has(n)),
  };
}

/**
 * Prépare `apt upgrade` : tous les paquets dont une mise à jour est connue.
 *
 * @param machine - Machine simulée.
 * @param commandLine - Ligne de commande d'origine.
 * @param requestedBy - Compte à l'origine de la demande.
 * @returns Le plan.
 */
export function planUpgrade(machine: Machine, commandLine: string, requestedBy: string): AptPlan {
  return { ...emptyPlan(commandLine, requestedBy), upgrade: upgradable(machine) };
}

/** Paquets installés automatiquement dont plus aucun paquet installé n'a besoin. */
export function autoremovable(
  machine: Machine,
  removed: ReadonlySet<string> = new Set(),
): string[] {
  const installed = Object.values(machine.packages).filter(
    (p) => p.installed && !removed.has(p.name),
  );
  const needed = new Set<string>();
  const visit = (name: string): void => {
    if (needed.has(name)) return;
    needed.add(name);
    for (const dep of PACKAGE_CATALOG[name]?.depends ?? []) visit(dep);
  };
  installed.filter((p) => !p.auto).forEach((p) => visit(p.name));
  return installed
    .filter((p) => p.auto && !needed.has(p.name))
    .map((p) => p.name)
    .sort();
}

/**
 * Prépare `apt autoremove`.
 *
 * @param machine - Machine simulée.
 * @param purge - Avec `--purge`.
 * @param commandLine - Ligne de commande d'origine.
 * @param requestedBy - Compte à l'origine de la demande.
 * @returns Le plan.
 */
export function planAutoremove(
  machine: Machine,
  purge: boolean,
  commandLine: string,
  requestedBy: string,
): AptPlan {
  return { ...emptyPlan(commandLine, requestedBy), remove: autoremovable(machine), purge };
}

/** Vrai si le plan ne change rien. */
export function planIsEmpty(plan: AptPlan): boolean {
  return plan.install.length + plan.upgrade.length + plan.remove.length === 0;
}

/**
 * Vrai si APT demande confirmation : dépendances supplémentaires, mises à jour
 * ou suppressions. Une installation simple, sans dépendance, se fait sans question.
 */
export function planNeedsConfirmation(plan: AptPlan): boolean {
  if (plan.remove.length > 0 || plan.upgrade.length > 0) return !planIsEmpty(plan);
  return plan.install.some((n) => !plan.requested.includes(n));
}

/** Liste de paquets indentée et coupée à 80 colonnes, comme APT. */
function wrapList(names: readonly string[], marker = ''): string {
  const lines: string[] = [];
  let current = ' ';
  for (const name of names) {
    const word = ` ${name}${marker}`;
    if (current.length + word.length > 79 && current.trim()) {
      lines.push(current);
      current = ' ';
    }
    current += word;
  }
  if (current.trim()) lines.push(current);
  return `${lines.join('\n')}\n`;
}

/** Taille téléchargée par le plan (octets). */
function downloadBytes(plan: AptPlan): number {
  return [...plan.install, ...plan.upgrade].reduce(
    (sum, n) => sum + (PACKAGE_CATALOG[n]?.downloadSize ?? 100_000),
    0,
  );
}

/**
 * Résumé du plan affiché avant la question « Souhaitez-vous continuer ? ».
 *
 * @param machine - Machine simulée (avant application).
 * @param plan - Plan calculé.
 * @returns Le texte, de « Les paquets supplémentaires… » à l'espace disque.
 */
export function describePlan(machine: Machine, plan: AptPlan): string {
  let text = '';
  for (const name of plan.current) {
    const p = machine.packages[name];
    if (!p) continue;
    if (plan.remove.length > 0 || !p.installed) {
      text += `Le paquet « ${name} » n'est pas installé, et ne peut donc être supprimé\n`;
    } else {
      text += `${name} est déjà la version la plus récente (${p.version}).\n`;
    }
  }
  for (const name of plan.manual) text += `${name} passé en « installé manuellement ».\n`;
  const removedSet = new Set(plan.remove);
  const orphans = plan.remove.length > 0 ? autoremovable(machine, removedSet) : [];
  if (orphans.length > 0 && plan.requested.length > 0) {
    text += `Les paquets suivants ont été installés automatiquement et ne sont plus nécessaires :\n${wrapList(orphans)}Veuillez utiliser « sudo apt autoremove » pour les supprimer.\n`;
  }
  const extras = plan.install.filter((n) => !plan.requested.includes(n));
  if (extras.length > 0) {
    text += `Les paquets supplémentaires suivants seront installés :\n${wrapList(extras)}`;
  }
  if (plan.remove.length > 0) {
    text += `Les paquets suivants seront ENLEVÉS :\n${wrapList(plan.remove, plan.purge ? '*' : '')}`;
  }
  if (plan.install.length > 0) {
    text += `Les NOUVEAUX paquets suivants seront installés :\n${wrapList(plan.install)}`;
  }
  if (plan.upgrade.length > 0) {
    text += `Les paquets suivants seront mis à jour :\n${wrapList(plan.upgrade)}`;
  }
  const held = upgradable(machine).filter((n) => !plan.upgrade.includes(n)).length;
  text += `${plan.upgrade.length} mis à jour, ${plan.install.length} nouvellement installés, ${plan.remove.length} à enlever et ${held} non mis à jour.\n`;
  const download = downloadBytes(plan);
  if (download > 0)
    text += `Il est nécessaire de prendre ${aptSize(download, 'o')} dans les archives.\n`;
  const added = plan.install.reduce((s, n) => s + (PACKAGE_CATALOG[n]?.installedSize ?? 0), 0);
  const freed = plan.remove.reduce((s, n) => s + (PACKAGE_CATALOG[n]?.installedSize ?? 0), 0);
  const delta = (added - freed) * 1024;
  if (plan.install.length + plan.remove.length > 0 && delta !== 0) {
    text +=
      delta > 0
        ? `Après cette opération, ${aptSize(delta, 'o')} d'espace disque supplémentaires seront utilisés.\n`
        : `Après cette opération, ${aptSize(-delta, 'o')} d'espace disque seront libérés.\n`;
  }
  return text;
}

/** Nom affiché par dpkg (les bibliothèques portent l'architecture). */
function dpkgName(name: string): string {
  return name.startsWith('lib') ? `${name}:amd64` : name;
}

/** Nom du fichier .deb (sans l'époque de la version). */
function debFile(name: string, version: string): string {
  return `${name}_${version.replace(/^\d+:/, '')}_amd64.deb`;
}

/** Date au format des journaux APT (`2026-11-03  09:30:12`). */
function logDate(ms: number, separator: string): string {
  const d = parisParts(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.year}-${p(d.month)}-${p(d.day)}${separator}${p(d.hour)}:${p(d.minute)}:${p(d.second)}`;
}

/** Ajoute du texte à un fichier journal de la machine (créé au besoin). */
function appendText(fs: Record<string, FsNode>, path: string, text: string, now: number): void {
  const node = fs[path];
  if (node?.type === 'file') fs[path] = { ...node, content: node.content + text, mtime: now };
  else
    fs[path] = {
      type: 'file',
      owner: 'root',
      group: 'root',
      mode: 0o644,
      mtime: now,
      content: text,
    };
}

/** Pose les fichiers d'un paquet (sans écraser une configuration existante). */
function installFiles(fs: Record<string, FsNode>, def: PackageDefinition, now: number): void {
  for (const f of packageFiles(def)) {
    const owner = f.owner ?? 'root';
    const group = f.group ?? 'root';
    if (f.type === 'dir') {
      if (!fs[f.path]) fs[f.path] = { type: 'dir', owner, group, mode: f.mode, mtime: now };
      continue;
    }
    if (f.config && fs[f.path]) continue;
    fs[f.path] = {
      type: 'file',
      owner,
      group,
      mode: f.mode,
      mtime: now,
      content: f.content ?? '',
      ...(f.size !== undefined ? { size: f.size } : {}),
    };
  }
}

/**
 * Pose les fichiers des paquets installés qui manquent encore (création d'une machine).
 *
 * @param fs - Système de fichiers en construction (modifié sur place).
 * @param packages - État des paquets.
 * @param now - Date des fichiers créés.
 */
export function seedPackageFiles(
  fs: Record<string, FsNode>,
  packages: Readonly<Record<string, PackageState>>,
  now: number,
): void {
  for (const p of Object.values(packages)) {
    const def = PACKAGE_CATALOG[p.name];
    if (!p.installed || !def) continue;
    const missing: Record<string, FsNode> = {};
    installFiles(missing, def, now);
    for (const [path, node] of Object.entries(missing)) {
      if (fs[path]) continue;
      for (let parent = dirname(path); !fs[parent]; parent = dirname(parent)) {
        fs[parent] = { type: 'dir', owner: 'root', group: 'root', mode: 0o755, mtime: now };
      }
      fs[path] = node;
    }
  }
}

/** Retire les fichiers d'un paquet ; la configuration reste sauf en purge. */
function removeFiles(fs: Record<string, FsNode>, def: PackageDefinition, purge: boolean): void {
  const files = packageFiles(def);
  for (const f of files) {
    if (f.type === 'dir') continue;
    if (f.config && !purge) continue;
    // Le contenu du site (index.html) n'est jamais supprimé par dpkg s'il a été modifié.
    if (f.path.startsWith('/var/www/')) continue;
    delete fs[f.path];
  }
  // Les dossiers ne partent que s'ils sont vides, du plus profond au plus haut.
  const dirs = files.filter((f) => f.type === 'dir').map((f) => f.path);
  for (const dir of dirs.sort((a, b) => b.length - a.length)) {
    if (dir === '/var/www' || dir === '/var/www/html') continue;
    if (!purge && files.some((f) => f.config && f.path.startsWith(`${dir}/`))) continue;
    const prefix = `${dir}/`;
    if (!Object.keys(fs).some((p) => p.startsWith(prefix))) delete fs[dir];
  }
}

/** Unité systemd minimale posée par un paquet de service. */
function unitFile(service: string, now: number): FsNode {
  const def = SERVICE_CATALOG[service];
  return {
    type: 'file',
    owner: 'root',
    group: 'root',
    mode: 0o644,
    mtime: now,
    content: `[Unit]\nDescription=${def?.description ?? service}\nAfter=network.target\n\n[Service]\nExecStart=${def?.execStart ?? ''}\n\n[Install]\nWantedBy=multi-user.target\n`,
  };
}

/** Installe et démarre le service d'un paquet (comme le script postinst de Debian). */
function addService(machine: Machine, service: string, now: number): Machine {
  const def = SERVICE_CATALOG[service];
  if (!def || machine.services[service]) return machine;
  const holder = Object.values(machine.services).find(
    (s) => s.state === 'active' && s.ports.some((p) => def.ports.includes(p)),
  );
  if (holder) {
    // Le port est déjà pris : le démarrage échoue, comme sur un vrai serveur.
    return {
      ...machine,
      services: {
        ...machine.services,
        [service]: {
          name: service,
          description: def.description,
          state: 'failed',
          enabled: true,
          failure: { kind: 'port-in-use', port: def.ports[0] ?? 80 },
          mainPid: null,
          since: now,
          ports: def.ports,
        },
      },
    };
  }
  const mainPid = machine.nextPid + 3;
  const started: Machine = {
    ...machine,
    nextPid: mainPid + def.processes.length,
    processes: [...machine.processes, ...serviceProcesses(def, mainPid, now)],
    services: {
      ...machine.services,
      [service]: {
        name: service,
        description: def.description,
        state: 'active',
        enabled: true,
        failure: null,
        mainPid,
        since: now,
        ports: def.ports,
      },
    },
  };
  return appendLogs(started, service, startLogLines(def, now));
}

/** Arrête et retire le service d'un paquet enlevé. */
function dropService(machine: Machine, service: string, now: number): Machine {
  if (!machine.services[service]) return machine;
  const stopped = stopService(machine, service, now).machine;
  const { [service]: _removed, ...services } = stopped.services;
  return { ...stopped, services };
}

/**
 * Applique un plan confirmé : téléchargement, dépaquetage, paramétrage, journaux APT.
 *
 * @param machine - Machine simulée.
 * @param plan - Plan à appliquer.
 * @param now - Horodatage (ms).
 * @returns La machine modifiée et la sortie de dpkg.
 */
export function applyPlan(machine: Machine, plan: AptPlan, now: number): AptOutput {
  const fs: Record<string, FsNode> = { ...machine.fs };
  const packages: Record<string, PackageState> = { ...machine.packages };
  let current: Machine = machine;
  let stdout = '';
  const fetched = [...plan.install, ...plan.upgrade];
  fetched.forEach((name, index) => {
    const p = machine.packages[name];
    const def = PACKAGE_CATALOG[name];
    if (!p) return;
    const suite = candidateSuite(p);
    const uri =
      suite === 'bookworm-security'
        ? 'http://security.debian.org/debian-security'
        : 'http://deb.debian.org/debian';
    stdout += `Réception de :${index + 1} ${uri} ${suite}/main amd64 ${dpkgName(name).replace(':amd64', '')} amd64 ${candidateVersion(p)} [${aptSize(def?.downloadSize ?? 100_000, 'B')}]\n`;
  });
  if (fetched.length > 0) {
    const bytes = downloadBytes(plan);
    stdout += `${aptSize(bytes, 'o')} réceptionnés en 0s (${aptSize(bytes * 4, 'o')}/s)\n`;
  }
  const database = `(Lecture de la base de données... ${30_000 + Object.keys(fs).length} fichiers et répertoires déjà installés.)\n`;
  let databaseShown = false;
  const showDatabase = (): void => {
    if (databaseShown) return;
    stdout += database;
    databaseShown = true;
  };
  const multiple = fetched.length > 1;
  const units: string[] = [];
  // Dépaquetage des nouveaux paquets puis des mises à jour.
  fetched.forEach((name, index) => {
    const p = machine.packages[name];
    if (!p) return;
    const version = candidateVersion(p);
    const shown = dpkgName(name);
    const deb = `${multiple ? `${index}-` : ''}${debFile(name, version)}`;
    if (!p.installed) {
      stdout += `Sélection du paquet ${shown} précédemment désélectionné.\n`;
      showDatabase();
      stdout += `Préparation du dépaquetage de .../${deb} ...\nDépaquetage de ${shown} (${version}) ...\n`;
    } else {
      showDatabase();
      stdout += `Préparation du dépaquetage de .../${deb} ...\nDépaquetage de ${shown} (${version}) sur (${p.version}) ...\n`;
    }
  });
  // Paramétrage, dans l'ordre des dépendances.
  for (const name of fetched) {
    const p = machine.packages[name];
    const def = PACKAGE_CATALOG[name];
    if (!p) continue;
    const version = candidateVersion(p);
    const { update: _u, updateListed: _l, configRemains: _c, ...rest } = p;
    const keepUpdate = p.update && !p.updateListed ? { update: p.update } : {};
    packages[name] = {
      ...rest,
      ...keepUpdate,
      version,
      installed: true,
      ...(p.installed ? {} : { auto: !plan.requested.includes(name) }),
    };
    if (def) installFiles(fs, def, now);
    stdout += `Paramétrage de ${dpkgName(name)} (${version}) ...\n`;
    if (def?.service && !p.installed) {
      fs[`/usr/lib/systemd/system/${def.service}.service`] = unitFile(def.service, now);
      units.push(def.service);
      stdout += `Created symlink /etc/systemd/system/multi-user.target.wants/${def.service}.service → /lib/systemd/system/${def.service}.service.\n`;
    }
  }
  for (const name of plan.manual) {
    const p = packages[name];
    if (p) packages[name] = { ...p, auto: false };
  }
  // Suppressions.
  const dropped: string[] = [];
  for (const name of plan.remove) {
    const p = machine.packages[name];
    const def = PACKAGE_CATALOG[name];
    if (!p) continue;
    showDatabase();
    if (p.installed) stdout += `Suppression de ${dpkgName(name)} (${p.version}) ...\n`;
    if (def) removeFiles(fs, def, plan.purge);
    if (def?.service) {
      dropped.push(def.service);
      if (plan.purge) delete fs[`/usr/lib/systemd/system/${def.service}.service`];
    }
    const { auto: _a, configRemains: _c, ...rest } = p;
    const hasConfig = (def?.files ?? []).some((f) => f.config);
    packages[name] = {
      ...rest,
      installed: false,
      ...(hasConfig && !plan.purge ? { configRemains: true } : {}),
    };
  }
  if (plan.purge) {
    for (const name of plan.remove) {
      const p = machine.packages[name];
      if (p && (PACKAGE_CATALOG[name]?.files ?? []).some((f) => f.config)) {
        stdout += `Purge des fichiers de configuration de ${dpkgName(name)} (${p.version}) ...\n`;
      }
    }
  }
  if (!planIsEmpty(plan))
    stdout += 'Traitement des actions différées (« triggers ») pour man-db (2.11.2-2) ...\n';
  // Journaux d'APT et de dpkg.
  const user = machine.users[plan.requestedBy];
  const list = (names: readonly string[], f: (p: PackageState) => string) =>
    names
      .map((n) => machine.packages[n])
      .filter((p): p is PackageState => p !== undefined)
      .map((p) => `${p.name}:amd64 (${f(p)})`)
      .join(', ');
  let history = `\nStart-Date: ${logDate(now, '  ')}\nCommandline: ${plan.commandLine}\n`;
  if (plan.requestedBy !== 'root' && user)
    history += `Requested-By: ${plan.requestedBy} (${user.uid})\n`;
  if (plan.install.length > 0)
    history += `Install: ${list(plan.install, (p) => candidateVersion(p) + (plan.requested.includes(p.name) ? '' : ', automatic'))}\n`;
  if (plan.upgrade.length > 0)
    history += `Upgrade: ${list(plan.upgrade, (p) => `${p.version}, ${candidateVersion(p)}`)}\n`;
  if (plan.remove.length > 0)
    history += `${plan.purge ? 'Purge' : 'Remove'}: ${list(plan.remove, (p) => p.version)}\n`;
  history += `End-Date: ${logDate(now, '  ')}\n`;
  if (!planIsEmpty(plan)) {
    appendText(fs, '/var/log/apt/history.log', history, now);
    let dpkgLog = '';
    for (const name of plan.install)
      dpkgLog += `${logDate(now, ' ')} install ${dpkgName(name)} <none> ${candidateVersion(machine.packages[name] ?? ({ version: '' } as PackageState))}\n`;
    for (const name of plan.upgrade) {
      const p = machine.packages[name];
      if (p)
        dpkgLog += `${logDate(now, ' ')} upgrade ${dpkgName(name)} ${p.version} ${candidateVersion(p)}\n`;
    }
    for (const name of plan.remove) {
      const p = machine.packages[name];
      if (p)
        dpkgLog += `${logDate(now, ' ')} ${plan.purge ? 'purge' : 'remove'} ${dpkgName(name)} ${p.version} <none>\n`;
    }
    appendText(fs, '/var/log/dpkg.log', dpkgLog, now);
  }
  current = { ...machine, fs, packages };
  for (const service of dropped) current = dropService(current, service, now);
  for (const service of units) current = addService(current, service, now);
  return { machine: current, stdout, stderr: '', exitCode: 0 };
}

/**
 * Termine les installations interrompues (`dpkg --configure -a`).
 *
 * @param machine - Machine simulée.
 * @returns La machine réparée et les lignes « Paramétrage de… ».
 */
export function configurePending(machine: Machine): AptOutput {
  const packages: Record<string, PackageState> = { ...machine.packages };
  let stdout = '';
  for (const p of Object.values(machine.packages).filter((x) => x.halfConfigured)) {
    const { halfConfigured: _h, ...rest } = p;
    packages[p.name] = rest;
    stdout += `Paramétrage de ${dpkgName(p.name)} (${p.version}) ...\n`;
  }
  return { machine: { ...machine, packages }, stdout, stderr: '', exitCode: 0 };
}

/** Nom d'archive affiché par `apt list` pour un paquet. */
export function archiveLabel(p: PackageState): string {
  return SUITE_ARCHIVE[candidateSuite(p)];
}
