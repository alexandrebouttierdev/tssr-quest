import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine } from '../test-utils';

const machine = debianServer({
  disks: [{ mount: '/var', size: '20G', used: '20G' }],
  files: {
    '/var/log/debug.log': { size: '18G', owner: 'root', group: 'adm', mode: '0640' },
    '/srv/app/a.bin': { size: '10K' },
    '/srv/app/sub/b.bin': { size: '5K' },
  },
});

describe('commande df', () => {
  it('affiche les systèmes de fichiers en tailles lisibles', () => {
    expect(runLine(machine, 'df -h').stdout).toMatchInlineSnapshot(`
      "Sys. de fichiers Taille Utilisé Dispo Uti% Monté sur
      udev               962M       0  962M   0% /dev
      tmpfs              197M    592K  197M   1% /run
      /dev/sda1           20G    3,3G   17G  17% /
      tmpfs              984M       0  984M   0% /dev/shm
      tmpfs              5,0M       0  5,0M   0% /run/lock
      /dev/sda3           20G     20G     0 100% /var
      "
    `);
  });

  it('affiche les blocs de 1K sans -h et le type avec -T', () => {
    const plain = runLine(machine, 'df').stdout;
    const typed = runLine(machine, 'df -hT /var').stdout;

    expect(plain.split('\n')[0]).toBe(
      'Sys. de fichiers blocs de 1K  Utilisé Disponible Uti% Monté sur',
    );
    expect(typed).toBe(
      'Sys. de fichiers Type Taille Utilisé Dispo Uti% Monté sur\n/dev/sda3        ext4    20G     20G     0 100% /var\n',
    );
  });

  it('signale un chemin absent', () => {
    const result = runLine(machine, 'df /absent');

    expect(result.stderr).toBe('df: /absent: Aucun fichier ou dossier de ce type\n');
    expect(result.exitCode).toBe(1);
  });

  it('refuse une option inconnue', () => {
    expect(runLine(machine, 'df -z').exitCode).toBe(1);
  });
});

describe('commande du', () => {
  it('affiche chaque dossier puis le total', () => {
    expect(runLine(machine, 'du /srv/app').stdout).toBe('12\t/srv/app/sub\n28\t/srv/app\n');
  });

  it('résume avec -s, en tailles lisibles avec -h', () => {
    expect(runLine(machine, 'du -sh /srv/app').stdout).toBe('28K\t/srv/app\n');
  });

  it('inclut les fichiers avec -a et un total général avec -c', () => {
    expect(runLine(machine, 'du -ac /srv/app').stdout).toBe(
      '12\t/srv/app/a.bin\n8\t/srv/app/sub/b.bin\n12\t/srv/app/sub\n28\t/srv/app\n28\ttotal\n',
    );
  });

  it('signale les dossiers illisibles et les chemins absents', () => {
    const result = runLine(machine, 'du -s /var/log /absent');

    // 18 Gio de debug.log + 4 Kio par dossier (/var/log, apt, installer, journal, private).
    expect(result.stdout).toBe('18874388\t/var/log\n');
    expect(result.stderr).toBe(
      "du: impossible de lire le répertoire '/var/log/private': Permission non accordée\ndu: impossible d'accéder à '/absent': Aucun fichier ou dossier de ce type\n",
    );
  });

  it('refuse une option inconnue', () => {
    expect(runLine(machine, 'du -z').exitCode).toBe(1);
  });
});
