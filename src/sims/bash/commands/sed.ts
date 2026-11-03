import { strerror } from '@sims/shared/errors';
import { readFile, writeFile } from '@sims/shared/fs';
import type { BashCommand } from '../command';
import { posixToJs } from '../regex';
import { joinLines, splitLines } from './helpers';

/** Adresse d'une commande sed : numéro de ligne, dernière ligne ou motif. */
type Address = { kind: 'line'; n: number } | { kind: 'last' } | { kind: 'regex'; re: RegExp };

/** Commande sed analysée. */
interface SedCommand {
  readonly from?: Address;
  readonly to?: Address;
  readonly op: 's' | 'd' | 'p';
  readonly re?: RegExp;
  readonly replacement?: string;
  readonly global?: boolean;
  readonly print?: boolean;
  readonly nth?: number;
}

/** Erreur de script sed (message de GNU sed en fr_FR). */
class SedError extends Error {}

/** Lit une adresse au début d'un morceau de script. */
function readAddress(text: string, extended: boolean): { address?: Address; rest: string } {
  const num = /^(\d+)/.exec(text);
  if (num) return { address: { kind: 'line', n: Number(num[1]) }, rest: text.slice(num[0].length) };
  if (text.startsWith('$')) return { address: { kind: 'last' }, rest: text.slice(1) };
  if (text.startsWith('/')) {
    const end = text.indexOf('/', 1);
    if (end < 0) throw new SedError('expression régulière non terminée');
    return {
      address: { kind: 'regex', re: new RegExp(posixToJs(text.slice(1, end), extended)) },
      rest: text.slice(end + 1),
    };
  }
  return { rest: text };
}

/** Analyse un script sed (commandes séparées par ; ou retour à la ligne). */
function parseScript(script: string, extended: boolean, index: number): SedCommand[] {
  const commands: SedCommand[] = [];
  let text = script.trim();
  while (text) {
    const first = readAddress(text, extended);
    let rest = first.rest;
    let to: Address | undefined;
    if (rest.startsWith(',')) {
      const second = readAddress(rest.slice(1), extended);
      to = second.address;
      rest = second.rest;
    }
    rest = rest.trimStart();
    const op = rest[0];
    const base = { ...(first.address ? { from: first.address } : {}), ...(to ? { to } : {}) };
    if (op === 'd' || op === 'p') {
      commands.push({ ...base, op });
      rest = rest.slice(1);
    } else if (op === 's') {
      const delimiter = rest[1] ?? '/';
      const parts: string[] = [];
      let current = '';
      let i = 2;
      for (; i < rest.length && parts.length < 2; i++) {
        const c = rest[i] ?? '';
        if (c === '\\' && rest[i + 1] === delimiter) {
          current += delimiter;
          i++;
        } else if (c === delimiter) {
          parts.push(current);
          current = '';
        } else current += c;
      }
      if (parts.length < 2)
        throw new SedError(
          `-e expression n°${index}, caractère ${rest.length + 1} : commande « s » inachevée`,
        );
      const flagsMatch = /^[gpi\d]*/.exec(rest.slice(i)) ?? [''];
      const flags = flagsMatch[0];
      rest = rest.slice(i + flags.length);
      let source: string;
      try {
        source = posixToJs(parts[0] ?? '', extended);
      } catch {
        throw new SedError(
          `-e expression n°${index}, caractère ${i} : expression régulière invalide`,
        );
      }
      const replacement = (parts[1] ?? '')
        .replace(/\\([1-9])/g, '$$$1')
        .replace(/(^|[^\\])&/g, '$1$$&')
        .replace(/\\&/g, '&')
        .replace(/\\n/g, '\n');
      const nth = /\d+/.exec(flags)?.[0];
      commands.push({
        ...base,
        op: 's',
        re: new RegExp(
          source,
          `${flags.includes('g') ? 'g' : ''}${flags.includes('i') ? 'i' : ''}`,
        ),
        replacement,
        global: flags.includes('g'),
        print: flags.includes('p'),
        ...(nth ? { nth: Number(nth) } : {}),
      });
    } else {
      throw new SedError(
        `-e expression n°${index}, caractère ${script.length - rest.length + 1} : commande inconnue : « ${op ?? ''} »`,
      );
    }
    text = rest.replace(/^\s*[;\n]\s*/, '').trim();
    if (text && text === rest.trim() && !/^[;\n]/.test(rest))
      throw new SedError(
        `-e expression n°${index}, caractère ${script.length - text.length + 1} : caractères inutiles après la commande`,
      );
  }
  return commands;
}

/** Vrai si la ligne `n` (1-based) correspond à une adresse. */
function matches(address: Address, n: number, line: string, total: number): boolean {
  if (address.kind === 'line') return n === address.n;
  if (address.kind === 'last') return n === total;
  return address.re.test(line);
}

/** Commande `sed` : édition de flux (substitutions, suppressions). */
export const sed: BashCommand = {
  name: 'sed',
  summary: 'modifie du texte ligne par ligne (substitutions)',
  manual: `NOM
       sed - éditer un flux de texte

SYNOPSIS
       sed [-n] [-E] [-i] 'SCRIPT' [FICHIER]...

DESCRIPTION
       s/MOTIF/REMPLACEMENT/g   remplacer (g : toutes les occurrences de la ligne)
       Nd                        supprimer la ligne N ($ = dernière)
       /MOTIF/d                  supprimer les lignes qui contiennent MOTIF
       -n 'Np'                   n'afficher que la ligne N
       -i                        modifier le fichier lui-même (attention !)
       -E                        expressions régulières étendues

EXEMPLES
       sed 's/Listen 80/Listen 8080/' ports.conf
       sudo sed -i 's/^#PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
       sed -n '10,20p' /var/log/syslog`,
  run(args, env) {
    let quiet = false;
    let inPlace = false;
    let extended = false;
    const scripts: string[] = [];
    const files: string[] = [];
    for (let i = 0; i < args.length; i++) {
      const arg = args[i] ?? '';
      if (arg === '-e') scripts.push(args[++i] ?? '');
      else if (/^-[niEr]+$/.test(arg)) {
        quiet ||= arg.includes('n');
        inPlace ||= arg.includes('i');
        extended ||= arg.includes('E') || arg.includes('r');
      } else if (arg.startsWith('-') && arg !== '-')
        return { stderr: `sed: option invalide -- '${arg[1] ?? ''}'\n`, exitCode: 1 };
      else if (scripts.length === 0) scripts.push(arg);
      else files.push(arg);
    }
    if (scripts.length === 0)
      return {
        stderr:
          "Utilisation : sed [OPTION]... {script-seulement-si-aucun-autre-script} [fichier-d'entrée]...\n",
        exitCode: 1,
      };
    let commands: SedCommand[];
    try {
      commands = scripts.flatMap((s, i) => parseScript(s, extended, i + 1));
    } catch (error) {
      if (error instanceof SedError) return { stderr: `sed: ${error.message}\n`, exitCode: 1 };
      throw error;
    }
    const process = (text: string): string => {
      const lines = splitLines(text);
      const out: string[] = [];
      const ranges = new Map<SedCommand, boolean>();
      lines.forEach((original, index) => {
        let line = original;
        let deleted = false;
        const n = index + 1;
        for (const command of commands) {
          let selected = true;
          if (command.from && command.to) {
            const active = ranges.get(command) ?? false;
            if (active) {
              selected = true;
              if (
                matches(command.to, n, line, lines.length) ||
                (command.to.kind === 'line' && n >= command.to.n)
              )
                ranges.set(command, false);
            } else if (matches(command.from, n, line, lines.length)) {
              selected = true;
              ranges.set(command, !(command.to.kind === 'line' && command.to.n <= n));
            } else selected = false;
          } else if (command.from) selected = matches(command.from, n, line, lines.length);
          if (!selected) continue;
          if (command.op === 'd') {
            deleted = true;
            break;
          }
          if (command.op === 'p') out.push(line);
          if (command.op === 's' && command.re) {
            let count = 0;
            const before = line;
            line = command.nth
              ? line.replace(
                  new RegExp(command.re.source, `g${command.re.flags.includes('i') ? 'i' : ''}`),
                  (...m) =>
                    ++count === command.nth
                      ? m[0].replace(
                          new RegExp(command.re?.source ?? ''),
                          command.replacement ?? '',
                        )
                      : m[0],
                )
              : line.replace(command.re, command.replacement ?? '');
            if (command.print && line !== before) out.push(line);
          }
        }
        if (!deleted && !quiet) out.push(line);
      });
      return joinLines(out);
    };
    if (files.length === 0) return { stdout: process(env.stdin), exitCode: 0 };
    let machine = env.machine;
    let stdout = '';
    let stderr = '';
    for (const file of files) {
      const path = env.resolve(file);
      const read = readFile(machine, path, env.user);
      if (!read.ok) {
        stderr += `sed: impossible de lire ${file}: ${strerror(read.error)}\n`;
        continue;
      }
      const result = process(read.value);
      if (!inPlace) {
        stdout += result;
        continue;
      }
      const written = writeFile(machine, path, env.user, result, { now: env.ctx.now.getTime() });
      if (written.ok) machine = written.value;
      else
        stderr += `sed: impossible d'ouvrir le fichier temporaire ${file.replace(/[^/]+$/, '')}sedXXXXXX: ${strerror(written.error)}\n`;
    }
    return { machine, stdout, stderr, exitCode: stderr ? (inPlace ? 4 : 2) : 0 };
  },
};
