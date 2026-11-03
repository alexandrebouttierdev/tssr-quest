import { strerror } from '@sims/shared/errors';
import { childrenOf, readFile, statPath } from '@sims/shared/fs';
import type { BashCommand, CommandEnv, CommandOutcome } from '../command';
import { parseOptions } from '../options';
import { posixToJs } from '../regex';
import { splitLines } from './helpers';

/** Recherche commune à grep et egrep. */
function runGrep(
  args: readonly string[],
  env: CommandEnv,
  forceExtended: boolean,
  name: string,
): CommandOutcome {
  const parsed = parseOptions(args, {
    name: 'grep',
    short: 'ivnclLrRwoqhHEFsx',
    withValue: 'e',
    long: {
      'ignore-case': 'i',
      'invert-match': 'v',
      'line-number': 'n',
      count: 'c',
      'files-with-matches': 'l',
      recursive: 'r',
      'word-regexp': 'w',
      'only-matching': 'o',
      quiet: 'q',
      'extended-regexp': 'E',
      'fixed-strings': 'F',
      regexp: 'e',
      'no-filename': 'h',
      'with-filename': 'H',
      'line-regexp': 'x',
    },
  });
  if (!parsed.ok) return { stderr: parsed.message.replaceAll('grep', name), exitCode: 2 };
  const { flags } = parsed;
  const operands = [...parsed.operands];
  const pattern = parsed.values.get('e') ?? operands.shift();
  if (pattern === undefined) {
    return {
      stderr: `Utilisation : ${name} [OPTION]... MOTIF [FICHIER]...\nSaisissez « ${name} --help » pour plus d'informations.\n`,
      exitCode: 2,
    };
  }
  let source: string;
  try {
    source = flags.has('F')
      ? pattern.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
      : posixToJs(pattern, forceExtended || flags.has('E'));
  } catch {
    return { stderr: `${name}: Expression régulière invalide\n`, exitCode: 2 };
  }
  if (flags.has('w')) source = `\\b(?:${source})\\b`;
  if (flags.has('x')) source = `^(?:${source})$`;
  const regex = new RegExp(source, flags.has('i') ? 'i' : '');
  const global = new RegExp(source, flags.has('i') ? 'gi' : 'g');
  const recursive = flags.has('r') || flags.has('R');

  // Fichiers à parcourir (avec descente dans les dossiers en -r).
  const files: { name: string; content: string }[] = [];
  let stderr = '';
  const addPath = (shown: string, path: string) => {
    const found = statPath(env.machine, path, env.user);
    if (!found.ok) {
      if (!flags.has('s')) stderr += `${name}: ${shown}: ${strerror(found.error)}\n`;
      return;
    }
    if (found.value.node.type === 'dir') {
      if (!recursive) {
        stderr += `${name}: ${shown}: ${strerror('EISDIR')}\n`;
        return;
      }
      for (const child of childrenOf(env.machine.fs, found.value.path))
        addPath(`${shown.replace(/\/$/, '')}/${child.name}`, child.path);
      return;
    }
    const read = readFile(env.machine, found.value.path, env.user);
    if (read.ok) files.push({ name: shown, content: read.value });
    else if (!flags.has('s')) stderr += `${name}: ${shown}: ${strerror(read.error)}\n`;
  };
  if (operands.length === 0) {
    if (recursive) addPath('.', env.cwd);
    else files.push({ name: '(entrée standard)', content: env.stdin });
  } else {
    for (const operand of operands) {
      if (operand === '-') files.push({ name: '(entrée standard)', content: env.stdin });
      else addPath(operand, env.resolve(operand));
    }
  }
  const withName = flags.has('H') || (!flags.has('h') && (files.length > 1 || recursive));
  let out = '';
  let matched = false;
  for (const file of files) {
    const lines = splitLines(file.content);
    let count = 0;
    lines.forEach((line, index) => {
      const hit = regex.test(line) !== flags.has('v');
      if (!hit) return;
      count++;
      matched = true;
      if (flags.has('c') || flags.has('l') || flags.has('q')) return;
      const prefix = `${withName ? `${file.name}:` : ''}${flags.has('n') ? `${index + 1}:` : ''}`;
      if (flags.has('o') && !flags.has('v'))
        for (const m of line.match(global) ?? []) out += `${prefix}${m}\n`;
      else out += `${prefix}${line}\n`;
    });
    if (flags.has('l') && count > 0) out += `${file.name}\n`;
    else if (flags.has('c')) out += `${withName ? `${file.name}:` : ''}${count}\n`;
  }
  if (flags.has('q')) out = '';
  return { stdout: out, stderr, exitCode: stderr && !matched ? 2 : matched ? 0 : 1, ok: !stderr };
}

/** Commande `grep` : cherche un motif dans des fichiers. */
export const grep: BashCommand = {
  name: 'grep',
  summary: 'cherche les lignes qui correspondent à un motif',
  manual: `NOM
       grep - afficher les lignes correspondant à un motif

SYNOPSIS
       grep [OPTION]... MOTIF [FICHIER]...

DESCRIPTION
       Affiche les lignes qui contiennent MOTIF (une expression régulière).
       Code de retour : 0 si une ligne correspond, 1 sinon, 2 en cas d'erreur.

       -i     ignorer la casse            -v     lignes qui NE correspondent PAS
       -n     numéros de ligne             -c     compter les lignes
       -r     chercher dans un dossier     -l     noms des fichiers seulement
       -w     mot entier                   -o     seulement la partie trouvée
       -E     expression étendue (+ ? | ( ) sans barre oblique inverse)

EXPRESSIONS
       .  un caractère    *  répété 0 fois ou plus    ^  début   $  fin
       [abc]  un de ces caractères    [0-9]  un chiffre    [[:digit:]]  idem

EXEMPLES
       grep -i error /var/log/syslog
       grep -c "Failed password" /var/log/auth.log
       grep -E "^(root|hugo):" /etc/passwd`,
  run: (args, env) => runGrep(args, env, false, 'grep'),
};

/** Commande `egrep` : grep -E (obsolète sur Debian 12, avec avertissement). */
export const egrep: BashCommand = {
  name: 'egrep',
  summary: 'grep -E (obsolète)',
  manual: `NOM
       egrep - ancienne forme de grep -E

SYNOPSIS
       egrep MOTIF [FICHIER]...

DESCRIPTION
       Depuis grep 3.8 (Debian 12), egrep affiche un avertissement : il faut
       écrire grep -E.`,
  run(args, env) {
    const result = runGrep(args, env, true, 'egrep');
    return {
      ...result,
      stderr: `egrep: warning: egrep is obsolescent; using grep -E\n${result.stderr ?? ''}`,
    };
  },
};
