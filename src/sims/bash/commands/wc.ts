import type { BashCommand } from '../command';
import { parseOptions } from '../options';
import { readInputs } from './helpers';

/** Commande `wc` : compte lignes, mots et octets. */
export const wc: BashCommand = {
  name: 'wc',
  summary: 'compte les lignes, les mots et les octets',
  manual: `NOM
       wc - compter les lignes, les mots et les octets

SYNOPSIS
       wc [-l] [-w] [-c] [-m] [FICHIER]...

DESCRIPTION
       Sans option : lignes, mots et octets.

       -l     lignes          -w     mots
       -c     octets          -m     caractères

EXEMPLES
       wc -l /etc/passwd               nombre de comptes
       grep -c "Failed" /var/log/auth.log`,
  run(args, env) {
    const parsed = parseOptions(args, {
      name: 'wc',
      short: 'lwcm',
      long: { lines: 'l', words: 'w', bytes: 'c', chars: 'm' },
    });
    if (!parsed.ok) return { stderr: parsed.message, exitCode: 1 };
    const order = ['l', 'w', 'm', 'c'].filter((f) => parsed.flags.has(f));
    const columns = order.length ? order : ['l', 'w', 'c'];
    const { inputs, stderr } = readInputs(env, parsed.operands, 'wc');
    const count = (text: string): Record<string, number> => ({
      l: (text.match(/\n/g) ?? []).length,
      w: text.split(/\s+/).filter(Boolean).length,
      m: [...text].length,
      c: new TextEncoder().encode(text).length,
    });
    const rows = inputs.map((i) => ({
      name: i.name === '-' ? '' : i.name,
      counts: count(i.content),
    }));
    if (rows.length > 1) {
      const total: Record<string, number> = { l: 0, w: 0, m: 0, c: 0 };
      for (const r of rows)
        for (const k of Object.keys(total)) total[k] = (total[k] ?? 0) + (r.counts[k] ?? 0);
      rows.push({ name: 'total', counts: total });
    }
    // Comme coreutils : pas de remplissage pour un seul nombre d'un seul fichier,
    // largeur 7 pour l'entrée standard, sinon largeur du plus grand nombre.
    const single = rows.length === 1 && columns.length === 1 && rows[0]?.name !== '';
    const fromStdin = inputs.some((i) => i.name === '-');
    const max = Math.max(
      ...rows.flatMap((r) => columns.map((c) => String(r.counts[c] ?? 0).length)),
    );
    const width = single ? 0 : fromStdin && columns.length > 1 ? 7 : max;
    const stdout = rows
      .map((r) =>
        [
          ...columns.map((c) => String(r.counts[c] ?? 0).padStart(width)),
          ...(r.name ? [r.name] : []),
        ].join(' '),
      )
      .join('\n');
    return { stdout: rows.length ? `${stdout}\n` : '', stderr, exitCode: stderr ? 1 : 0 };
  },
};
