import { writeFile } from '@sims/shared/fs';
import { strerror } from '@sims/shared/errors';
import type { BashCommand } from '../command';
import { compareNames } from '../format';
import { parseOptions } from '../options';
import { joinLines, readInputs, splitLines } from './helpers';
import { parseSize } from '@sims/shared/size';

/** Lit une liste de champs de cut (`1,3`, `2-4`, `3-`). */
function parseFieldList(spec: string): ((n: number) => boolean) | null {
  const ranges = spec.split(',').map((part) => {
    const m = /^(\d*)-?(\d*)$/.exec(part);
    if (!m || part === '' || part === '-') return null;
    const from = m[1] ? Number(m[1]) : 1;
    const to = part.includes('-') ? (m[2] ? Number(m[2]) : Number.POSITIVE_INFINITY) : from;
    return [from, to] as const;
  });
  if (ranges.some((r) => r === null || r[0] < 1)) return null;
  return (n) => ranges.some((r) => r !== null && n >= r[0] && n <= r[1]);
}

/** Commande `cut` : extrait des colonnes. */
export const cut: BashCommand = {
  name: 'cut',
  summary: 'extrait des colonnes de chaque ligne',
  manual: `NOM
       cut - extraire des parties de chaque ligne

SYNOPSIS
       cut -d SÉPARATEUR -f CHAMPS [FICHIER]...
       cut -c POSITIONS [FICHIER]...

DESCRIPTION
       -d C   séparateur de champs (tabulation par défaut)
       -f N   champs à garder : 1   1,3   2-4   3-
       -c N   caractères à garder

EXEMPLES
       cut -d: -f1 /etc/passwd          noms des comptes
       cut -d: -f1,7 /etc/passwd        comptes et shells`,
  run(args, env) {
    const parsed = parseOptions(args, {
      name: 'cut',
      short: 's',
      withValue: 'dfc',
      long: { delimiter: 'd', fields: 'f', characters: 'c' },
    });
    if (!parsed.ok) return { stderr: parsed.message, exitCode: 1 };
    const fields = parsed.values.get('f');
    const chars = parsed.values.get('c');
    if (fields === undefined && chars === undefined) {
      return {
        stderr:
          "cut: vous devez spécifier une liste d'octets, de caractères ou de champs\nSaisissez « cut --help » pour plus d'informations.\n",
        exitCode: 1,
      };
    }
    const keep = parseFieldList(fields ?? chars ?? '');
    if (!keep) return { stderr: `cut: champ ou plage de champs invalide\n`, exitCode: 1 };
    const delimiter = parsed.values.get('d') ?? '\t';
    if ([...delimiter].length !== 1)
      return { stderr: 'cut: le délimiteur doit être un seul caractère\n', exitCode: 1 };
    const { inputs, stderr } = readInputs(env, parsed.operands, 'cut');
    const out: string[] = [];
    for (const input of inputs) {
      for (const line of splitLines(input.content)) {
        if (chars !== undefined) {
          out.push([...line].filter((_, i) => keep(i + 1)).join(''));
        } else if (!line.includes(delimiter)) {
          if (!parsed.flags.has('s')) out.push(line);
        } else {
          out.push(
            line
              .split(delimiter)
              .filter((_, i) => keep(i + 1))
              .join(delimiter),
          );
        }
      }
    }
    return { stdout: joinLines(out), stderr, exitCode: stderr ? 1 : 0 };
  },
};

/** Valeur d'une taille lisible (`4,0K`, `18G`) pour sort -h. */
function humanValue(text: string): number {
  try {
    return parseSize(text.trim().replace(',', '.'));
  } catch {
    return Number.parseFloat(text) || 0;
  }
}

/** Commande `sort` : trie des lignes. */
export const sort: BashCommand = {
  name: 'sort',
  summary: 'trie des lignes de texte',
  manual: `NOM
       sort - trier des lignes de texte

SYNOPSIS
       sort [OPTION]... [FICHIER]...

DESCRIPTION
       -r     ordre inverse            -n     ordre numérique
       -h     tailles lisibles (2K, 1G)  -u     sans doublons
       -t C   séparateur de champs     -k N   trier sur le champ N

EXEMPLES
       sort -t: -k3 -n /etc/passwd     comptes triés par UID
       du -sh /var/* | sort -h         dossiers du plus petit au plus gros`,
  run(args, env) {
    const parsed = parseOptions(args, {
      name: 'sort',
      short: 'rnuhf',
      withValue: 'tk',
      long: {
        reverse: 'r',
        'numeric-sort': 'n',
        unique: 'u',
        'human-numeric-sort': 'h',
        'ignore-case': 'f',
        'field-separator': 't',
        key: 'k',
      },
    });
    if (!parsed.ok) return { stderr: parsed.message, exitCode: 2 };
    const { flags } = parsed;
    const { inputs, stderr } = readInputs(env, parsed.operands, 'sort');
    if (stderr)
      return {
        stderr: stderr.replace(/^sort: (.*): /m, 'sort: impossible de lire: $1: '),
        exitCode: 2,
      };
    const separator = parsed.values.get('t');
    const keyField = Number(
      (parsed.values.get('k') ?? '0').split(',')[0]?.replace(/\D.*$/, '') ?? 0,
    );
    const keyOf = (line: string): string => {
      if (!keyField) return line;
      const parts = separator !== undefined ? line.split(separator) : line.trim().split(/\s+/);
      return parts.slice(keyField - 1).join(separator ?? ' ');
    };
    const lines = inputs.flatMap((i) => splitLines(i.content));
    const compare = (a: string, b: string): number => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      if (flags.has('n'))
        return (Number.parseFloat(ka) || 0) - (Number.parseFloat(kb) || 0) || compareNames(a, b);
      if (flags.has('h')) return humanValue(ka) - humanValue(kb) || compareNames(a, b);
      return compareNames(ka, kb);
    };
    let sorted = [...lines].sort(compare);
    if (flags.has('u'))
      sorted = sorted.filter((line, i) => i === 0 || compare(sorted[i - 1] ?? '', line) !== 0);
    if (flags.has('r')) sorted.reverse();
    return { stdout: joinLines(sorted), exitCode: 0 };
  },
};

/** Commande `uniq` : regroupe les lignes identiques consécutives. */
export const uniq: BashCommand = {
  name: 'uniq',
  summary: 'supprime les lignes répétées consécutives',
  manual: `NOM
       uniq - signaler ou supprimer les lignes répétées

SYNOPSIS
       uniq [-c] [-d] [-u] [-i] [FICHIER]

DESCRIPTION
       Ne garde qu'une ligne pour chaque suite de lignes identiques
       CONSÉCUTIVES : on l'utilise presque toujours après sort.

       -c     préfixer par le nombre d'occurrences
       -d     seulement les lignes répétées
       -u     seulement les lignes uniques
       -i     ignorer la casse

EXEMPLES
       cut -d' ' -f1 access.log | sort | uniq -c | sort -rn | head`,
  run(args, env) {
    const parsed = parseOptions(args, {
      name: 'uniq',
      short: 'cdui',
      long: { count: 'c', repeated: 'd', unique: 'u', 'ignore-case': 'i' },
    });
    if (!parsed.ok) return { stderr: parsed.message, exitCode: 1 };
    const { flags } = parsed;
    const { inputs, stderr } = readInputs(env, parsed.operands.slice(0, 1), 'uniq');
    const same = (a: string, b: string) =>
      flags.has('i') ? a.toLowerCase() === b.toLowerCase() : a === b;
    const groups: { line: string; count: number }[] = [];
    for (const line of inputs.flatMap((i) => splitLines(i.content))) {
      const last = groups.at(-1);
      if (last && same(last.line, line)) last.count++;
      else groups.push({ line, count: 1 });
    }
    const out = groups
      .filter((g) => (!flags.has('d') || g.count > 1) && (!flags.has('u') || g.count === 1))
      .map((g) => (flags.has('c') ? `${String(g.count).padStart(7)} ${g.line}` : g.line));
    return { stdout: joinLines(out), stderr, exitCode: stderr ? 1 : 0 };
  },
};

/** Développe un ensemble de tr (`a-z`, `[:upper:]`, `\n`). */
function expandSet(set: string): string[] {
  const classes: Record<string, string> = {
    '[:lower:]': 'abcdefghijklmnopqrstuvwxyz',
    '[:upper:]': 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    '[:digit:]': '0123456789',
    '[:space:]': ' \t\n\r\f\v',
    '[:blank:]': ' \t',
    '[:punct:]': '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~',
  };
  let text = set;
  for (const [name, chars] of Object.entries(classes)) text = text.replaceAll(name, chars);
  text = text.replace(/\\n/g, '\n').replace(/\\t/g, '\t');
  const chars = [...text];
  const out: string[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i] ?? '';
    const end = chars[i + 2];
    if (chars[i + 1] === '-' && end !== undefined) {
      for (let code = c.charCodeAt(0); code <= end.charCodeAt(0); code++)
        out.push(String.fromCharCode(code));
      i += 2;
    } else out.push(c);
  }
  return out;
}

/** Commande `tr` : remplace ou supprime des caractères. */
export const tr: BashCommand = {
  name: 'tr',
  summary: 'remplace ou supprime des caractères',
  manual: `NOM
       tr - remplacer ou supprimer des caractères

SYNOPSIS
       tr [-d] [-s] ENSEMBLE1 [ENSEMBLE2]

DESCRIPTION
       Lit l'entrée standard et remplace chaque caractère d'ENSEMBLE1 par celui
       d'ENSEMBLE2 au même rang.

       -d     supprimer les caractères d'ENSEMBLE1
       -s     fusionner les répétitions d'un caractère

EXEMPLES
       echo "bonjour" | tr a-z A-Z       BONJOUR
       cat fichier | tr -s ' '           espaces multiples réduits à un`,
  run(args, env) {
    const parsed = parseOptions(args, {
      name: 'tr',
      short: 'ds',
      long: { delete: 'd', 'squeeze-repeats': 's' },
    });
    if (!parsed.ok) return { stderr: parsed.message, exitCode: 1 };
    const [first, second] = parsed.operands;
    if (
      first === undefined ||
      (!parsed.flags.has('d') && !parsed.flags.has('s') && second === undefined)
    ) {
      return {
        stderr: `tr: opérande manquant${first ? ` après '${first}'` : ''}\nSaisissez « tr --help » pour plus d'informations.\n`,
        exitCode: 1,
      };
    }
    const from = expandSet(first);
    const to = second === undefined ? [] : expandSet(second);
    let out = '';
    let previous = '';
    for (const c of env.stdin) {
      if (parsed.flags.has('d') && from.includes(c)) continue;
      const index = from.indexOf(c);
      const mapped =
        !parsed.flags.has('d') && to.length && index >= 0
          ? (to[Math.min(index, to.length - 1)] ?? c)
          : c;
      const squeezeSet = parsed.flags.has('d') ? to : to.length ? to : from;
      if (parsed.flags.has('s') && mapped === previous && squeezeSet.includes(mapped)) continue;
      out += mapped;
      previous = mapped;
    }
    return { stdout: out, exitCode: 0 };
  },
};

/** Commande `tee` : copie l'entrée vers la sortie et des fichiers. */
export const tee: BashCommand = {
  name: 'tee',
  summary: "écrit l'entrée à l'écran et dans des fichiers",
  manual: `NOM
       tee - lire l'entrée standard et l'écrire dans des fichiers

SYNOPSIS
       tee [-a] FICHIER...

DESCRIPTION
       Affiche ce qu'il reçoit ET l'écrit dans les fichiers.

       -a     ajouter à la fin au lieu d'écraser

EXEMPLES
       echo "nameserver 1.1.1.1" | sudo tee -a /etc/resolv.conf
       (contrairement à « sudo echo ... > fichier », ici c'est tee, lancé
       avec sudo, qui écrit le fichier)`,
  run(args, env) {
    const parsed = parseOptions(args, { name: 'tee', short: 'a', long: { append: 'a' } });
    if (!parsed.ok) return { stderr: parsed.message, exitCode: 1 };
    let machine = env.machine;
    let stderr = '';
    for (const operand of parsed.operands) {
      const written = writeFile(machine, env.resolve(operand), env.user, env.stdin, {
        append: parsed.flags.has('a'),
        now: env.ctx.now.getTime(),
      });
      if (written.ok) machine = written.value;
      else stderr += `tee: ${operand}: ${strerror(written.error)}\n`;
    }
    return { machine, stdout: env.stdin, stderr, exitCode: stderr ? 1 : 0 };
  },
};

/** Pagineurs (`more`, `less`) : dans le terminal du jeu, le texte s'affiche en entier. */
function pager(name: 'more' | 'less'): BashCommand {
  return {
    name,
    summary:
      name === 'less'
        ? 'affiche un fichier page par page'
        : 'affiche un fichier page par page (simple)',
    manual: `NOM
       ${name} - afficher un fichier page par page

SYNOPSIS
       ${name} FICHIER

DESCRIPTION
       Sur un vrai terminal, ${name} affiche le fichier écran par écran
       (Espace : page suivante, q : quitter${name === 'less' ? ', /mot : chercher' : ''}).
       Dans le terminal du jeu, le texte s'affiche en entier et on fait défiler.`,
    run(args, env) {
      const operands = args.filter((a) => !a.startsWith('-'));
      const { inputs, stderr } = readInputs(env, operands, name);
      return { stdout: inputs.map((i) => i.content).join(''), stderr, exitCode: stderr ? 1 : 0 };
    },
  };
}

/** Commande `more`. */
export const more = pager('more');
/** Commande `less`. */
export const less = pager('less');

/** Interprète les séquences d'échappement de printf. */
function escapes(text: string): string {
  return text.replace(/\\([ntr\\"]|0[0-7]{0,3})/g, (_m, s: string) =>
    s === 'n'
      ? '\n'
      : s === 't'
        ? '\t'
        : s === 'r'
          ? '\r'
          : s === '\\'
            ? '\\'
            : s === '"'
              ? '"'
              : String.fromCharCode(parseInt(s, 8)),
  );
}

/** Commande `printf` : affichage formaté. */
export const printf: BashCommand = {
  name: 'printf',
  summary: 'affiche du texte formaté',
  manual: `NOM
       printf - afficher du texte formaté

SYNOPSIS
       printf FORMAT [ARGUMENT]...

DESCRIPTION
       Comme echo, mais avec un format : %s (texte), %d (entier), %5s
       (largeur 5), %-10s (aligné à gauche), \\n (nouvelle ligne).
       Le format est réutilisé tant qu'il reste des arguments.

EXEMPLES
       printf "%-10s %s\\n" hugo admin julie compta`,
  run(args) {
    const [format, ...values] = args;
    if (format === undefined)
      return { stderr: 'printf: utilisation : printf [-v var] format [arguments]\n', exitCode: 2 };
    let out = '';
    let index = 0;
    do {
      let consumed = false;
      out += escapes(
        format.replace(
          /%(-?)(\d*)(?:\.(\d+))?([sdifx%])/g,
          (_m, left: string, width: string, precision: string | undefined, kind: string) => {
            if (kind === '%') return '%';
            consumed = true;
            const raw = values[index++] ?? '';
            let text: string;
            if (kind === 'd' || kind === 'i') text = String(Math.trunc(Number(raw) || 0));
            else if (kind === 'f')
              text = (Number(raw) || 0)
                .toFixed(precision ? Number(precision) : 6)
                .replace('.', ',');
            else if (kind === 'x') text = (Math.trunc(Number(raw)) || 0).toString(16);
            else text = precision ? raw.slice(0, Number(precision)) : raw;
            const w = Number(width || 0);
            return left ? text.padEnd(w) : text.padStart(w);
          },
        ),
      );
      if (!consumed) break;
    } while (index < values.length);
    return { stdout: out, exitCode: 0 };
  },
};

/** Commande `sleep` : attente (instantanée dans la simulation). */
export const sleep: BashCommand = {
  name: 'sleep',
  summary: 'attend un certain temps',
  manual: `NOM
       sleep - attendre

SYNOPSIS
       sleep DURÉE

DESCRIPTION
       Attend DURÉE secondes (5, 0.5, 2m…). Dans la simulation, l'attente est
       instantanée.`,
  run(args) {
    if (args.length === 0)
      return {
        stderr: "sleep: opérande manquant\nSaisissez « sleep --help » pour plus d'informations.\n",
        exitCode: 1,
      };
    const bad = args.find((a) => !/^\d+(\.\d+)?[smhd]?$/.test(a));
    if (bad)
      return {
        stderr: `sleep: intervalle de temps « ${bad} » incorrect\nSaisissez « sleep --help » pour plus d'informations.\n`,
        exitCode: 1,
      };
    return { exitCode: 0 };
  },
};
