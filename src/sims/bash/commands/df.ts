import { diskForPath, diskUsage } from '@sims/shared/disks';
import { strerror } from '@sims/shared/errors';
import { statPath } from '@sims/shared/fs';
import { formatHumanSize } from '@sims/shared/size';
import type { Disk } from '@sims/shared/types';
import type { BashCommand } from '../command';
import { alignTable } from '../format';
import { parseOptions } from '../options';

/** Commande `df` : occupation des systèmes de fichiers montés. */
export const df: BashCommand = {
  name: 'df',
  summary: "affiche l'espace disque utilisé et disponible",
  manual: `NOM
       df - afficher l'occupation des systèmes de fichiers

SYNOPSIS
       df [OPTION]... [FICHIER]...

DESCRIPTION
       Affiche, pour chaque système de fichiers monté, sa taille, l'espace
       utilisé, l'espace disponible, le pourcentage d'occupation (Uti%) et le
       point de montage. Avec un FICHIER, n'affiche que le système qui le porte.

       -h     tailles lisibles (K, M, G)
       -T     afficher le type de système de fichiers (ext4, tmpfs…)

EXEMPLES
       df -h          vue d'ensemble lisible
       df -h /var     le disque qui porte /var

À RETENIR
       Un disque plein à 100 % empêche les services d'écrire leurs fichiers :
       ils refusent alors de démarrer.`,
  run(args, env) {
    const parsed = parseOptions(args, {
      name: 'df',
      short: 'hT',
      long: { 'human-readable': 'h', 'print-type': 'T' },
    });
    if (!parsed.ok) return { stderr: parsed.message, exitCode: 1 };
    const human = parsed.flags.has('h');
    const withType = parsed.flags.has('T');
    let stderr = '';
    let disks: Disk[] = [...env.machine.disks];
    if (parsed.operands.length) {
      disks = [];
      for (const operand of parsed.operands) {
        const found = statPath(env.machine, env.resolve(operand), env.user);
        if (!found.ok) {
          stderr += `df: ${operand}: ${strerror(found.error)}\n`;
          continue;
        }
        const disk = diskForPath(env.machine, found.value.path);
        if (disk) disks.push(disk);
      }
    }
    const value = (bytes: number) =>
      human ? formatHumanSize(bytes) : String(Math.ceil(bytes / 1024));
    const header = human
      ? ['Sys. de fichiers', 'Taille', 'Utilisé', 'Dispo', 'Uti%', 'Monté sur']
      : ['Sys. de fichiers', 'blocs de 1K', 'Utilisé', 'Disponible', 'Uti%', 'Monté sur'];
    const rows = disks.map((d) => {
      const used = Math.min(d.size, diskUsage(env.machine, d));
      const avail = d.size - used;
      const percent = d.size === 0 ? '-' : `${Math.ceil((used / d.size) * 100)}%`;
      return [d.device, value(d.size), value(used), value(avail), percent, d.mount];
    });
    const withTypes = (row: string[], type: string) =>
      withType ? [row[0] ?? '', type, ...row.slice(1)] : row;
    const table = [
      withTypes(header, 'Type'),
      ...rows.map((r, i) => withTypes(r, disks[i]?.fstype ?? '')),
    ];
    const align: ('l' | 'r')[] = withType
      ? ['l', 'l', 'r', 'r', 'r', 'r', 'l']
      : ['l', 'r', 'r', 'r', 'r', 'l'];
    const lines = disks.length ? alignTable(table, align) : [];
    return {
      stdout: lines.length ? `${lines.join('\n')}\n` : '',
      stderr,
      exitCode: stderr ? 1 : 0,
    };
  },
};
