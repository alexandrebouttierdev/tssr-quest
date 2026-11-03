import { strerror } from '@sims/shared/errors';
import {
  childrenOf,
  fileSize,
  makeDir,
  readFile,
  removePath,
  setNode,
  statPath,
  writeFile,
} from '@sims/shared/fs';
import { canAccess, userGroups } from '@sims/shared/permissions';
import { basename } from '@sims/shared/path';
import type { FsNode, Machine } from '@sims/shared/types';
import type { BashCommand, CommandEnv, CommandOutcome } from '../command';
import { formatDate } from './info';

/** Marqueurs des fichiers d'archive simulés (lus aussi par `file`). */
const TAR = 'TSSR-TAR\n';
const GZIP = 'TSSR-GZIP\n';
const ZIP = 'TSSR-ZIP\n';

/** Entrée d'archive : nom relatif et nœud d'origine. */
interface Entry {
  readonly name: string;
  readonly node: FsNode;
}

/** Taille compressée estimée (gzip/deflate) : le texte se compresse bien, le binaire presque pas. */
export function compressedSize(node: FsNode): number {
  if (node.type !== 'file') return 0;
  if (node.size !== undefined) return Math.ceil(node.size * 0.98);
  const length = new TextEncoder().encode(node.content).length;
  return length === 0 ? 20 : Math.ceil(length * 0.4) + 24;
}

/** Taille d'une archive tar : en-tête de 512 octets par entrée, blocs de 512, enregistrements de 10 Kio. */
function tarSize(entries: readonly Entry[]): number {
  const raw = entries.reduce(
    (sum, e) => sum + 512 + (e.node.type === 'file' ? Math.ceil(fileSize(e.node) / 512) * 512 : 0),
    1024,
  );
  return Math.ceil(raw / 10_240) * 10_240;
}

/** Lit récursivement des fichiers pour les archiver. */
function collect(
  env: CommandEnv,
  operand: string,
  name: string,
  errors: string[],
  command: string,
): Entry[] {
  const found = statPath(env.machine, env.resolve(operand), env.user, { follow: false });
  if (!found.ok) {
    errors.push(`${command}: ${operand} : Impossible de faire un stat: ${strerror(found.error)}`);
    return [];
  }
  const { node, path } = found.value;
  if (node.type !== 'symlink' && !canAccess(env.machine, env.user, node, 'read')) {
    errors.push(`${command}: ${operand} : Impossible d'ouvrir: ${strerror('EACCES')}`);
    return [];
  }
  if (node.type !== 'dir') return [{ name, node }];
  const entries: Entry[] = [{ name: `${name.replace(/\/$/, '')}/`, node }];
  for (const child of childrenOf(env.machine.fs, path)) {
    entries.push(
      ...collect(
        env,
        `${operand.replace(/\/$/, '')}/${child.name}`,
        `${name.replace(/\/$/, '')}/${child.name}`,
        errors,
        command,
      ),
    );
  }
  return entries;
}

/** Écrit un fichier d'archive avec sa taille déclarée. */
function writeArchive(
  env: CommandEnv,
  machine: Machine,
  path: string,
  content: string,
  size: number,
): { machine?: Machine; error?: string } {
  const written = writeFile(machine, path, env.user, content, { now: env.ctx.now.getTime() });
  if (!written.ok) return { error: strerror(written.error) };
  const node = written.value.fs[path];
  return {
    machine:
      node?.type === 'file' ? setNode(written.value, path, { ...node, size }) : written.value,
  };
}

/** Désarchive des entrées sous un dossier. */
function extract(
  env: CommandEnv,
  machine: Machine,
  entries: readonly Entry[],
  into: string,
  verbose: boolean,
): { machine: Machine; stdout: string; errors: string[] } {
  let current = machine;
  let stdout = '';
  const errors: string[] = [];
  const now = env.ctx.now.getTime();
  const group = userGroups(machine, env.user)[0] ?? env.user;
  for (const entry of entries) {
    const target = `${into === '/' ? '' : into}/${entry.name.replace(/\/$/, '')}`;
    if (verbose) stdout += `${entry.name}\n`;
    if (entry.node.type === 'dir') {
      const made = makeDir(current, target, env.user, { parents: true, now });
      if (!made.ok)
        errors.push(
          `tar: ${entry.name.replace(/\/$/, '')} : Impossible de créer le répertoire: ${strerror(made.error)}`,
        );
      else current = made.value;
      continue;
    }
    // Comme tar, on recrée les dossiers parents absents de l'archive.
    const parentDir = target.slice(0, target.lastIndexOf('/')) || '/';
    if (!current.fs[parentDir]) {
      const made = makeDir(current, parentDir, env.user, { parents: true, now });
      if (made.ok) current = made.value;
    }
    const written = writeFile(
      current,
      target,
      env.user,
      entry.node.type === 'file' ? entry.node.content : '',
      { now },
    );
    if (!written.ok) {
      errors.push(`tar: ${entry.name} : Impossible d'ouvrir: ${strerror(written.error)}`);
      continue;
    }
    // root garde les propriétaires d'origine ; un utilisateur devient propriétaire des fichiers extraits.
    const keepOwner = env.user === 'root';
    current = setNode(written.value, target, {
      ...entry.node,
      owner: keepOwner ? entry.node.owner : env.user,
      group: keepOwner ? entry.node.group : group,
      mtime: entry.node.mtime,
    });
  }
  return { machine: current, stdout, errors };
}

/** Lit le contenu JSON d'une archive (tar éventuellement compressé). */
function readTar(content: string): Entry[] | null {
  let text = content;
  if (text.startsWith(GZIP)) {
    const inner = JSON.parse(text.slice(GZIP.length)) as { node?: FsNode };
    text = inner.node?.type === 'file' ? inner.node.content : '';
  }
  if (!text.startsWith(TAR)) return null;
  return (JSON.parse(text.slice(TAR.length)) as { entries: Entry[] }).entries;
}

/** Ligne de `tar -tv`. */
function listLine(entry: Entry): string {
  const modeChars = (m: number) =>
    ['r', 'w', 'x'].map((c, i) => ((m >> (2 - i)) & 1 ? c : '-')).join('');
  const type = entry.node.type === 'dir' ? 'd' : entry.node.type === 'symlink' ? 'l' : '-';
  const mode =
    type +
    modeChars(entry.node.mode >> 6) +
    modeChars(entry.node.mode >> 3) +
    modeChars(entry.node.mode);
  const size = entry.node.type === 'file' ? fileSize(entry.node) : 0;
  return `${mode} ${entry.node.owner}/${entry.node.group} ${String(size).padStart(9)} ${formatDate(entry.node.mtime, '%F %R')} ${entry.name}`;
}

/** Message de fin de tar en cas d'erreurs. */
const TAR_FAIL = "tar: Arrêt avec code d'échec dû aux erreurs précédentes\n";

/** Commande `tar` : archives. */
export const tar: BashCommand = {
  name: 'tar',
  summary: 'crée, liste ou extrait des archives tar',
  manual: `NOM
       tar - archiver des fichiers

SYNOPSIS
       tar -c|-t|-x [-v] [-z] -f ARCHIVE [FICHIERS]... [-C DOSSIER]

DESCRIPTION
       -c     créer une archive          -x     extraire une archive
       -t     lister le contenu          -v     afficher les fichiers traités
       -z     compresser avec gzip (.tar.gz, .tgz)
       -f F   nom du fichier d'archive (toujours en dernière lettre : -czvf)
       -C D   extraire dans le dossier D

EXEMPLES
       tar -czvf sauvegarde-$(date +%F).tar.gz /etc/apache2
       tar -tzvf sauvegarde.tar.gz
       tar -xzvf sauvegarde.tar.gz -C /tmp/restauration`,
  run(rawArgs, env) {
    const args = [...rawArgs];
    if (args[0] && !args[0].startsWith('-') && /^[ctxvzfC]+$/.test(args[0]))
      args[0] = `-${args[0]}`;
    let mode: 'c' | 'x' | 't' | null = null;
    let verbose = false;
    let gzip = false;
    let file: string | undefined;
    let into: string | undefined;
    const operands: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i] ?? '';
      if (arg === '-C' || arg === '--directory') {
        into = args[++i];
        continue;
      }
      if (arg.startsWith('--')) {
        if (arg === '--create') mode = 'c';
        else if (arg === '--extract') mode = 'x';
        else if (arg === '--list') mode = 't';
        else if (arg === '--gzip') gzip = true;
        else if (arg === '--verbose') verbose = true;
        else if (arg.startsWith('--file=')) file = arg.slice(7);
        else
          return {
            stderr: `tar: option non reconnue « ${arg} »\nSaisissez « tar --help » ou « tar --usage » pour plus d'informations.\n`,
            exitCode: 2,
          };
        continue;
      }
      if (!arg.startsWith('-')) {
        operands.push(arg);
        continue;
      }
      for (const letter of arg.slice(1)) {
        if (letter === 'c' || letter === 'x' || letter === 't') {
          if (mode && mode !== letter)
            return {
              stderr:
                "tar: Vous ne pouvez spécifier plus d'une option parmi « -Acdtrux », « --delete » ou « --test-label »\nSaisissez « tar --help » ou « tar --usage » pour plus d'informations.\n",
              exitCode: 2,
            };
          mode = letter;
        } else if (letter === 'v') verbose = true;
        else if (letter === 'z') gzip = true;
        else if (letter === 'f') file = args[++i];
        else
          return {
            stderr: `tar: option invalide -- '${letter}'\nSaisissez « tar --help » ou « tar --usage » pour plus d'informations.\n`,
            exitCode: 2,
          };
      }
    }
    if (!mode)
      return {
        stderr:
          "tar: Vous devez spécifier l'une des options « -Acdtrux », « --delete » ou « --test-label »\nSaisissez « tar --help » ou « tar --usage » pour plus d'informations.\n",
        exitCode: 2,
      };
    if (file === undefined)
      return {
        stderr:
          "tar: Refus d'écrire les données de l'archive sur un terminal.\nSaisissez « tar --help » ou « tar --usage » pour plus d'informations.\n",
        exitCode: 2,
      };
    const archivePath = env.resolve(file);

    if (mode === 'c') {
      if (operands.length === 0)
        return {
          stderr:
            "tar: Refus de créer une archive vide (lâche)\nSaisissez « tar --help » ou « tar --usage » pour plus d'informations.\n",
          exitCode: 2,
        };
      const errors: string[] = [];
      let stderr = '';
      if (operands.some((o) => o.startsWith('/')))
        stderr += 'tar: Suppression de « / » au début des noms des membres\n';
      const entries = operands.flatMap((o) =>
        collect(env, o, o.replace(/^\/+/, '') || '.', errors, 'tar'),
      );
      const payload = `${TAR}${JSON.stringify({ entries })}`;
      const size = tarSize(entries);
      const content = gzip
        ? `${GZIP}${JSON.stringify({ name: basename(archivePath).replace(/\.(tgz|gz)$/, '.tar'), node: { type: 'file', owner: env.user, group: env.user, mode: 0o644, mtime: 0, content: payload, size } })}`
        : payload;
      const finalSize = gzip ? entries.reduce((s, e) => s + compressedSize(e.node), 0) + 512 : size;
      const written = writeArchive(env, env.machine, archivePath, content, finalSize);
      if (written.error)
        return {
          stderr: `${stderr}tar: ${file} : Impossible d'ouvrir: ${written.error}\ntar: Error is not recoverable: exiting now\n`,
          exitCode: 2,
        };
      stderr += errors.map((e) => `${e}\n`).join('');
      if (errors.length) stderr += TAR_FAIL;
      return {
        ...(written.machine ? { machine: written.machine } : {}),
        stdout: verbose ? entries.map((e) => `${e.name}\n`).join('') : '',
        stderr,
        exitCode: errors.length ? 2 : 0,
      };
    }

    const read = readFile(env.machine, archivePath, env.user);
    if (!read.ok)
      return {
        stderr: `tar: ${file} : Impossible d'ouvrir: ${strerror(read.error)}\ntar: Error is not recoverable: exiting now\n`,
        exitCode: 2,
      };
    let entries: Entry[] | null;
    try {
      entries = readTar(read.value);
    } catch {
      entries = null;
    }
    if (!entries)
      return {
        stderr: `tar: Ceci ne ressemble pas à une archive de type « tar »\n${TAR_FAIL}`,
        exitCode: 2,
      };
    const wanted = operands.length
      ? entries.filter((e) =>
          operands.some((o) => e.name === o || e.name.startsWith(`${o.replace(/\/$/, '')}/`)),
        )
      : entries;
    if (mode === 't')
      return {
        stdout: wanted.map((e) => `${verbose ? listLine(e) : e.name}\n`).join(''),
        exitCode: 0,
      };
    const target = into === undefined ? env.cwd : env.resolve(into);
    if (into !== undefined && env.machine.fs[target]?.type !== 'dir')
      return {
        stderr: `tar: ${into} : Impossible de faire un chdir: ${strerror('ENOENT')}\ntar: Error is not recoverable: exiting now\n`,
        exitCode: 2,
      };
    const result = extract(env, env.machine, wanted, target, verbose);
    const stderr =
      result.errors.map((e) => `${e}\n`).join('') + (result.errors.length ? TAR_FAIL : '');
    return {
      machine: result.machine,
      stdout: result.stdout,
      stderr,
      exitCode: result.errors.length ? 2 : 0,
    };
  },
};

/** Compression gzip d'un fichier (remplace le fichier par fichier.gz). */
function gzipOne(
  env: CommandEnv,
  machine: Machine,
  operand: string,
  keep: boolean,
  verbose: boolean,
): { machine: Machine; stderr: string; ok: boolean } {
  const path = env.resolve(operand);
  const found = statPath(machine, path, env.user);
  if (!found.ok)
    return { machine, stderr: `gzip: ${operand}: ${strerror(found.error)}\n`, ok: false };
  if (found.value.node.type === 'dir')
    return { machine, stderr: `gzip: ${operand} is a directory -- ignored\n`, ok: false };
  if (operand.endsWith('.gz'))
    return { machine, stderr: `gzip: ${operand} already has .gz suffix -- unchanged\n`, ok: false };
  const node = found.value.node;
  if (node.type !== 'file' || !canAccess(machine, env.user, node, 'read'))
    return { machine, stderr: `gzip: ${operand}: ${strerror('EACCES')}\n`, ok: false };
  const written = writeArchive(
    env,
    machine,
    `${path}.gz`,
    `${GZIP}${JSON.stringify({ name: basename(path), node })}`,
    compressedSize(node),
  );
  if (!written.machine)
    return { machine, stderr: `gzip: ${operand}.gz: ${written.error ?? ''}\n`, ok: false };
  let next = setNode(written.machine, `${path}.gz`, {
    ...(written.machine.fs[`${path}.gz`] as FsNode),
    mode: node.mode,
    mtime: node.mtime,
  });
  if (!keep) {
    const removed = removePath(next, path, env.user, {});
    if (removed.ok) next = removed.value;
  }
  const size = fileSize(node);
  const ratio = size === 0 ? 0 : (1 - compressedSize(node) / size) * 100;
  return {
    machine: next,
    stderr: verbose
      ? `${operand}:\t${ratio.toFixed(1).padStart(5)}% -- ${keep ? 'created' : 'replaced with'} ${operand}.gz\n`
      : '',
    ok: true,
  };
}

/** Décompression d'un fichier .gz. */
function gunzipOne(
  env: CommandEnv,
  machine: Machine,
  operand: string,
  keep: boolean,
  toStdout: boolean,
): { machine: Machine; stdout: string; stderr: string; ok: boolean } {
  if (!operand.endsWith('.gz') && !operand.endsWith('.tgz'))
    return {
      machine,
      stdout: '',
      stderr: `gzip: ${operand}: unknown suffix -- ignored\n`,
      ok: false,
    };
  const path = env.resolve(operand);
  const read = readFile(machine, path, env.user);
  if (!read.ok)
    return {
      machine,
      stdout: '',
      stderr: `gzip: ${operand}: ${strerror(read.error)}\n`,
      ok: false,
    };
  if (!read.value.startsWith(GZIP))
    return { machine, stdout: '', stderr: `gzip: ${operand}: not in gzip format\n`, ok: false };
  const { node } = JSON.parse(read.value.slice(GZIP.length)) as { node: FsNode };
  if (toStdout)
    return { machine, stdout: node.type === 'file' ? node.content : '', stderr: '', ok: true };
  const target = path.replace(/\.gz$/, '').replace(/\.tgz$/, '.tar');
  const written = writeArchive(
    env,
    machine,
    target,
    node.type === 'file' ? node.content : '',
    fileSize(node),
  );
  if (!written.machine)
    return { machine, stdout: '', stderr: `gzip: ${target}: ${written.error ?? ''}\n`, ok: false };
  let next = setNode(written.machine, target, {
    ...node,
    owner: env.user === 'root' ? node.owner : env.user,
  });
  if (!keep) {
    const removed = removePath(next, path, env.user, {});
    if (removed.ok) next = removed.value;
  }
  return { machine: next, stdout: '', stderr: '', ok: true };
}

/** Partie commune de gzip, gunzip et zcat. */
function runGzip(
  args: readonly string[],
  env: CommandEnv,
  forceDecompress: boolean,
  forceStdout: boolean,
): CommandOutcome {
  const flags = new Set(args.filter((a) => a.startsWith('-')).flatMap((a) => [...a.slice(1)]));
  const operands = args.filter((a) => !a.startsWith('-'));
  const bad = [...flags].find((f) => !'dkvlcf'.includes(f));
  if (bad)
    return {
      stderr: `gzip: invalid option -- '${bad}'\nTry \`gzip --help' for more information.\n`,
      exitCode: 1,
    };
  const decompress = forceDecompress || flags.has('d');
  let machine = env.machine;
  let stdout = '';
  let stderr = '';
  let failed = false;
  if (flags.has('l')) {
    stdout += '         compressed        uncompressed  ratio uncompressed_name\n';
    for (const operand of operands) {
      const read = readFile(machine, env.resolve(operand), env.user);
      if (!read.ok || !read.value.startsWith(GZIP)) {
        stderr += `gzip: ${operand}: not in gzip format\n`;
        continue;
      }
      const { name, node } = JSON.parse(read.value.slice(GZIP.length)) as {
        name: string;
        node: FsNode;
      };
      const size = fileSize(node);
      const packed = fileSize(machine.fs[env.resolve(operand)] as FsNode);
      stdout += `${String(packed).padStart(19)} ${String(size).padStart(19)} ${(size ? (1 - packed / size) * 100 : 0).toFixed(1).padStart(5)}% ${name}\n`;
    }
    return { stdout, stderr, exitCode: stderr ? 1 : 0 };
  }
  if (operands.length === 0)
    return {
      stderr: 'gzip: compressed data not written to a terminal. Use -f to force compression.\n',
      exitCode: 1,
    };
  for (const operand of operands) {
    if (decompress) {
      const result = gunzipOne(
        env,
        machine,
        operand,
        flags.has('k'),
        forceStdout || flags.has('c'),
      );
      machine = result.machine;
      stdout += result.stdout;
      stderr += result.stderr;
      failed ||= !result.ok;
    } else {
      const result = gzipOne(env, machine, operand, flags.has('k'), flags.has('v'));
      machine = result.machine;
      stderr += result.stderr;
      failed ||= !result.ok;
    }
  }
  return { machine, stdout, stderr, exitCode: failed ? 1 : 0, ok: !failed || !!stdout };
}

/** Commande `gzip` : compression. */
export const gzip: BashCommand = {
  name: 'gzip',
  summary: 'compresse des fichiers (.gz)',
  manual: `NOM
       gzip - compresser des fichiers

SYNOPSIS
       gzip [-k] [-v] [-d] [-l] FICHIER...

DESCRIPTION
       Remplace FICHIER par FICHIER.gz, compressé.

       -k     garder le fichier d'origine     -d     décompresser (= gunzip)
       -v     afficher le taux de compression -l     informations sur un .gz`,
  run: (args, env) => runGzip(args, env, false, false),
};

/** Commande `gunzip` : décompression. */
export const gunzip: BashCommand = {
  name: 'gunzip',
  summary: 'décompresse des fichiers .gz',
  manual: `NOM
       gunzip - décompresser des fichiers .gz

SYNOPSIS
       gunzip [-k] FICHIER.gz...`,
  run: (args, env) => runGzip(args, env, true, false),
};

/** Commande `zcat` : affiche un fichier compressé. */
export const zcat: BashCommand = {
  name: 'zcat',
  summary: "affiche le contenu d'un fichier .gz",
  manual: `NOM
       zcat - afficher le contenu d'un fichier compressé

SYNOPSIS
       zcat FICHIER.gz...

EXEMPLES
       zcat /var/log/syslog.2.gz | grep error`,
  run: (args, env) => runGzip(args, env, true, true),
};

/** Commande `zip` : archive zip. */
export const zip: BashCommand = {
  name: 'zip',
  summary: 'crée des archives .zip',
  manual: `NOM
       zip - créer une archive zip (format courant sous Windows)

SYNOPSIS
       zip [-r] ARCHIVE.zip FICHIERS...

DESCRIPTION
       -r     inclure les dossiers et leur contenu`,
  run(args, env) {
    const recursive = args.includes('-r');
    const [archive, ...files] = args.filter((a) => !a.startsWith('-'));
    if (archive === undefined || files.length === 0)
      return { stderr: '\nzip error: Nothing to do! (' + (archive ?? '') + ')\n', exitCode: 12 };
    const name = archive.endsWith('.zip') ? archive : `${archive}.zip`;
    const errors: string[] = [];
    let stdout = '';
    const entries: Entry[] = [];
    for (const f of files) {
      const collected = collect(env, f, f, errors, 'zip');
      for (const e of recursive ? collected : collected.slice(0, 1)) {
        entries.push(e);
        const size = e.node.type === 'file' ? fileSize(e.node) : 0;
        const ratio =
          e.node.type === 'file' && size > 0
            ? Math.max(0, Math.round((1 - compressedSize(e.node) / size) * 100))
            : 0;
        stdout += `  adding: ${e.name} (${ratio > 0 ? `deflated ${ratio}%` : 'stored 0%'})\n`;
      }
    }
    if (entries.length === 0)
      return {
        stderr: `\tzip warning: name not matched: ${files[0] ?? ''}\n\nzip error: Nothing to do! (${name})\n`,
        exitCode: 12,
      };
    const size = entries.reduce((s, e) => s + compressedSize(e.node) + 100, 22);
    const written = writeArchive(
      env,
      env.machine,
      env.resolve(name),
      `${ZIP}${JSON.stringify({ entries })}`,
      size,
    );
    if (!written.machine)
      return {
        stderr: `zip I/O error: ${written.error ?? ''}\nzip error: Could not create output file (${name})\n`,
        exitCode: 15,
      };
    return {
      machine: written.machine,
      stdout,
      stderr: errors.map((e) => `${e}\n`).join(''),
      exitCode: 0,
    };
  },
};

/** Commande `unzip` : extraction d'une archive zip. */
export const unzip: BashCommand = {
  name: 'unzip',
  summary: 'extrait des archives .zip',
  manual: `NOM
       unzip - extraire une archive zip

SYNOPSIS
       unzip [-l] ARCHIVE.zip [-d DOSSIER]

DESCRIPTION
       -l     lister le contenu       -d D   extraire dans le dossier D`,
  run(args, env) {
    const dIndex = args.indexOf('-d');
    const dest = dIndex >= 0 ? args[dIndex + 1] : undefined;
    const archive = args.find((a, i) => !a.startsWith('-') && !(dIndex >= 0 && i === dIndex + 1));
    if (archive === undefined)
      return {
        stderr:
          'UnZip 6.00 of 20 April 2009, by Debian.\nUsage: unzip [-Z] [-opts[modifiers]] file[.zip] [list] [-x xlist] [-d exdir]\n',
        exitCode: 0,
      };
    const read = readFile(env.machine, env.resolve(archive), env.user);
    if (!read.ok || !read.value.startsWith(ZIP)) {
      return {
        stderr: `unzip:  cannot find or open ${archive}, ${archive}.zip or ${archive}.ZIP.\n`,
        exitCode: 9,
      };
    }
    const { entries } = JSON.parse(read.value.slice(ZIP.length)) as { entries: Entry[] };
    if (args.includes('-l')) {
      const files = entries.filter((e) => e.node.type === 'file');
      const total = files.reduce((s, e) => s + fileSize(e.node), 0);
      const rows = entries.map(
        (e) =>
          `${String(e.node.type === 'file' ? fileSize(e.node) : 0).padStart(9)}  ${formatDate(e.node.mtime, '%Y-%m-%d %H:%M')}   ${e.name}`,
      );
      return {
        stdout: `Archive:  ${archive}\n  Length      Date    Time    Name\n---------  ---------- -----   ----\n${rows.join('\n')}\n---------                     -------\n${String(total).padStart(9)}                     ${entries.length} file${entries.length > 1 ? 's' : ''}\n`,
        exitCode: 0,
      };
    }
    const target = dest === undefined ? env.cwd : env.resolve(dest);
    let machine = env.machine;
    if (dest !== undefined && !machine.fs[target]) {
      const made = makeDir(machine, target, env.user, {
        parents: true,
        now: env.ctx.now.getTime(),
      });
      if (made.ok) machine = made.value;
    }
    const result = extract(env, machine, entries, target, false);
    const lines = entries.map((e) =>
      e.node.type === 'dir'
        ? `   creating: ${dest ? `${dest.replace(/\/$/, '')}/` : ''}${e.name}`
        : `  inflating: ${dest ? `${dest.replace(/\/$/, '')}/` : ''}${e.name}`,
    );
    return {
      machine: result.machine,
      stdout: `Archive:  ${archive}\n${lines.join('\n')}\n`,
      stderr: result.errors.map((e) => `${e.replace(/^tar/, 'unzip')}\n`).join(''),
      exitCode: result.errors.length ? 1 : 0,
    };
  },
};
