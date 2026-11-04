import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine, runLines } from '../test-utils';

const NOW = Date.UTC(2026, 10, 3, 8, 26);
const machine = debianServer({
  now: NOW,
  groups: { adm: ['hugo'] },
  files: {
    '/home/hugo/notes.txt': {
      owner: 'hugo',
      content: 'Toujours lire le statut\n',
      mtime: NOW - 86_400_000 * 10,
    },
    '/home/hugo/script.sh': { owner: 'hugo', content: '#!/bin/bash\necho ok\n', mode: '0755' },
    '/home/hugo/accent.txt': { owner: 'hugo', content: 'Hélène\n' },
    '/home/hugo/vide.txt': { owner: 'hugo', content: '' },
    '/srv/rapports/2026/rapport-final.odt': {
      content: '',
      size: '120K',
      owner: 'julie',
      mtime: NOW - 86_400_000 * 3,
    },
    '/srv/rapports/2025/vieux.log': { content: '', size: '200M', mtime: NOW - 86_400_000 * 400 },
  },
});

describe('find', () => {
  it('cherche par nom, type et taille', () => {
    expect(runLine(machine, 'find /srv -name "*.odt"').stdout).toBe(
      '/srv/rapports/2026/rapport-final.odt\n',
    );
    expect(runLine(machine, 'find /srv -iname "RAPPORT-*"').stdout).toBe(
      '/srv/rapports/2026/rapport-final.odt\n',
    );
    expect(runLine(machine, 'find /srv/rapports -type d').stdout).toBe(
      '/srv/rapports\n/srv/rapports/2025\n/srv/rapports/2026\n',
    );
    expect(runLine(machine, 'find /srv -size +100M').stdout).toBe('/srv/rapports/2025/vieux.log\n');
    expect(runLine(machine, 'find /srv -type f -size -2M').stdout).toBe(
      '/srv/rapports/2026/rapport-final.odt\n',
    );
    expect(runLine(machine, 'find /srv -size 120k').stdout).toBe(
      '/srv/rapports/2026/rapport-final.odt\n',
    );
  });

  it('cherche par propriétaire, droits, date et profondeur', () => {
    expect(runLine(machine, 'find /srv -user julie').stdout).toBe(
      '/srv/rapports/2026/rapport-final.odt\n',
    );
    expect(runLine(machine, 'find /srv -group root -type f').stdout).toBe(
      '/srv/rapports/2025/vieux.log\n',
    );
    expect(runLine(machine, 'find . -perm 755 -type f').stdout).toBe('./script.sh\n');
    expect(runLine(machine, 'find /usr/bin -perm -4000').stdout).toBe(
      '/usr/bin/passwd\n/usr/bin/sudo\n',
    );
    expect(runLine(machine, 'find /srv -mtime +30 -type f').stdout).toBe(
      '/srv/rapports/2025/vieux.log\n',
    );
    expect(runLine(machine, 'find /srv -mtime -7 -type f').stdout).toBe(
      '/srv/rapports/2026/rapport-final.odt\n',
    );
    expect(runLine(machine, 'find /srv -mtime 3 -type f').stdout).toBe(
      '/srv/rapports/2026/rapport-final.odt\n',
    );
    expect(runLine(machine, 'find /srv -maxdepth 1').stdout).toBe('/srv\n/srv/rapports\n');
    expect(runLine(machine, 'find /srv -mindepth 2 -maxdepth 2').stdout).toBe(
      '/srv/rapports/2025\n/srv/rapports/2026\n',
    );
  });

  it('signale les dossiers illisibles et les critères invalides', () => {
    const result = runLine(machine, 'find /root /absent -name x');

    expect(result.stderr).toBe(
      "find: '/root': Permission non accordée\nfind: '/absent': Aucun fichier ou dossier de ce type\n",
    );
    expect(runLine(machine, 'find . -bidule').stderr).toBe('find: prédicat inconnu « -bidule »\n');
    expect(runLine(machine, 'find . -name').stderr).toBe(
      'find: argument manquant pour « -name »\n',
    );
    expect(runLine(machine, 'find . -type x').stderr).toBe('find: Type inconnu dans -type : x\n');
    expect(runLine(machine, 'find . -size beaucoup').stderr).toContain('Taille invalide');
    expect(runLine(machine, 'find . -perm abc').stderr).toContain('mode non valable');
    for (const opt of ['-type', '-size', '-user', '-perm', '-mtime', '-maxdepth', '-iname'])
      expect(runLine(machine, `find . ${opt}`).exitCode).toBe(1);
    expect(runLine(machine, 'find . -exec ls').exitCode).toBe(1);
  });

  it('exécute une commande ou supprime les fichiers trouvés', () => {
    expect(runLine(machine, 'find . -name "*.txt" -exec wc -l {} \\;').stdout).toBe(
      '1 ./accent.txt\n1 ./notes.txt\n0 ./vide.txt\n',
    );
    const deleted = runLine(machine, 'find . -name "*.txt" -print -delete');
    expect(deleted.state.fs['/home/hugo/notes.txt']).toBeUndefined();
    expect(runLine(machine, 'find /srv -name "*.log" -delete').stderr).toContain(
      'Permission non accordée',
    );
  });
});

describe('locate et updatedb', () => {
  it('trouve les fichiers connus de la base, pas les nouveaux avant updatedb', () => {
    expect(runLine(machine, 'locate rapport-final').stdout).toBe(
      '/srv/rapports/2026/rapport-final.odt\n',
    );
    expect(runLine(machine, 'locate -i RAPPORT-FINAL').exitCode).toBe(0);
    expect(runLine(machine, 'locate "*.odt"').stdout).toBe(
      '/srv/rapports/2026/rapport-final.odt\n',
    );
    expect(runLines(machine, ['touch nouveau.md', 'locate nouveau.md']).exitCode).toBe(1);
    expect(
      runLines(machine, ['touch nouveau.md', 'sudo updatedb', 'locate nouveau.md']).stdout,
    ).toBe('/home/hugo/nouveau.md\n');
    expect(runLine(machine, 'updatedb').exitCode).toBe(1);
    expect(runLine(machine, 'locate').stderr).toBe('locate: pas de motif à rechercher indiqué\n');
    expect(runLine(machine, 'locate .bashrc').stdout).not.toContain('/root');
  });
});

describe('which, type, file, stat', () => {
  it('trouve un programme dans le PATH', () => {
    expect(runLine(machine, 'which ls systemctl').stdout).toBe('/usr/bin/ls\n/usr/bin/systemctl\n');
    expect(runLine(machine, 'which useradd').exitCode).toBe(1);
    expect(runLine(machine, 'sudo which useradd').stdout).toBe('/usr/sbin/useradd\n');
  });

  it('indique la nature des commandes', () => {
    expect(runLine(machine, 'type cd ls ll grep useradd inconnu')).toMatchObject({
      stdout:
        'cd est une primitive du shell\nls est un alias vers « ls --color=auto »\nll est un alias vers « ls -l »\ngrep est /usr/bin/grep\nuseradd est /usr/sbin/useradd\n',
      stderr: 'bash: type: inconnu : non trouvé\n',
    });
  });

  it('devine la nature des fichiers', () => {
    expect(
      runLine(machine, 'file notes.txt script.sh accent.txt vide.txt /etc /bin /usr/bin/ls absent')
        .stdout,
    ).toBe(
      [
        'notes.txt: ASCII text',
        'script.sh: Bourne-Again shell script, ASCII text executable',
        'accent.txt: Unicode text, UTF-8 text',
        'vide.txt: empty',
        '/etc: directory',
        '/bin: symbolic link to usr/bin',
        '/usr/bin/ls: ELF 64-bit LSB pie executable, x86-64, version 1 (SYSV), dynamically linked, interpreter /lib64/ld-linux-x86-64.so.2, for GNU/Linux 3.2.0, stripped',
        "absent: cannot open `absent' (No such file or directory)",
        '',
      ].join('\n'),
    );
    expect(runLine(machine, 'file /srv/rapports/2025/vieux.log').stdout).toBe(
      '/srv/rapports/2025/vieux.log: data\n',
    );
  });

  it('affiche les métadonnées, ou un format personnalisé', () => {
    expect(runLine(machine, 'stat notes.txt').stdout).toMatchInlineSnapshot(`
      "  Fichier : notes.txt
         Taille : 24        	Blocs : 8          Blocs d'E/S : 4096   fichier
      Périphérique : 8/1	Inœud : 923676      Liens : 1
      Accès : (0644/-rw-r--r--)  UID : ( 1000/    hugo)   GID : ( 1000/    hugo)
       Accès : 2026-10-24 10:26:00.000000000 +0200
      Modif. : 2026-10-24 10:26:00.000000000 +0200
      Changt : 2026-10-24 10:26:00.000000000 +0200
        Créé : 2026-10-24 10:26:00.000000000 +0200
      "
    `);
    expect(runLine(machine, "stat -c '%a %A %U:%G %s %n' script.sh /tmp").stdout).toBe(
      '755 -rwxr-xr-x hugo:hugo 20 script.sh\n1777 drwxrwxrwt root:root 4096 /tmp\n',
    );
    expect(runLine(machine, 'stat absent').stderr).toBe(
      "stat: impossible d'évaluer 'absent': Aucun fichier ou dossier de ce type\n",
    );
    expect(runLine(machine, 'stat /bin vide.txt /tmp').stdout).toContain(
      'Fichier : /bin -> usr/bin',
    );
  });
});

describe('whatis, apropos, history', () => {
  it('donne le résumé des commandes', () => {
    expect(runLine(machine, 'whatis ls').stdout).toBe(
      "ls (1)               - liste le contenu d'un répertoire\n",
    );
    expect(runLine(machine, 'whatis inconnu')).toMatchObject({
      stderr: "inconnu: rien d'approprié.\n",
      exitCode: 16,
    });
  });

  it('cherche par mot-clé', () => {
    expect(runLine(machine, 'apropos disque').stdout).toContain('df (1)');
    expect(runLine(machine, 'apropos zzz').exitCode).toBe(16);
    expect(runLine(machine, 'apropos').stderr).toBe('apropos quoi ?\n');
  });

  it("liste l'historique numéroté", () => {
    const result = runLines(machine, ['pwd', 'ls | wc -l', 'history']);

    expect(result.stdout).toBe('    1  pwd\n    2  ls | wc -l\n    3  history\n');
    expect(runLines(machine, ['pwd', 'ls', 'history 2']).stdout).toBe(
      '    2  ls\n    3  history 2\n',
    );
  });
});

describe('date, uname, id, groups, who, nano', () => {
  it('affiche la date en français ou selon un format', () => {
    expect(runLine(machine, 'date').stdout).toBe('mardi 3 novembre 2026, 09:31:44 (UTC+0100)\n');
    expect(runLine(machine, 'date +%F').stdout).toBe('2026-11-03\n');
    expect(runLine(machine, 'date "+%A %d %B %Y %H:%M:%S %j %Z %u %a %b %e %R %s %%"').stdout).toBe(
      'mardi 03 novembre 2026 09:31:44 307 CET 2 mar. nov.  3 09:31 1793694704 %\n',
    );
    expect(runLine(machine, 'date demain').exitCode).toBe(1);
  });

  it('décrit le noyau', () => {
    expect(runLine(machine, 'uname').stdout).toBe('Linux\n');
    expect(runLine(machine, 'uname -r').stdout).toBe('6.1.0-26-amd64\n');
    expect(runLine(machine, 'uname -a').stdout).toBe(
      'Linux srv-web01 6.1.0-26-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.112-1 (2024-09-30) x86_64 GNU/Linux\n',
    );
    expect(runLine(machine, 'uname -z').exitCode).toBe(1);
  });

  it("affiche l'identité et les groupes", () => {
    expect(runLine(machine, 'id').stdout).toBe(
      'uid=1000(hugo) gid=1000(hugo) groupes=1000(hugo),4(adm),24(cdrom),25(floppy),27(sudo),29(audio),30(dip),44(video),46(plugdev),100(users),106(netdev)\n',
    );
    expect(runLine(machine, 'id julie').stdout).toBe(
      'uid=1001(julie) gid=1001(julie) groupes=1001(julie)\n',
    );
    expect(runLine(machine, 'id -u').stdout).toBe('1000\n');
    expect(runLine(machine, 'id -un').stdout).toBe('hugo\n');
    expect(runLine(machine, 'id -g julie').stdout).toBe('1001\n');
    expect(runLine(machine, 'id -gn julie').stdout).toBe('julie\n');
    expect(runLine(machine, 'id -G julie').stdout).toBe('1001\n');
    expect(runLine(machine, 'id -Gn julie').stdout).toBe('julie\n');
    expect(runLine(machine, 'id fantome').stderr).toBe("id: 'fantome' : utilisateur inexistant\n");
    expect(runLine(machine, 'groups').stdout).toBe(
      'hugo adm cdrom floppy sudo audio dip video plugdev users netdev\n',
    );
    expect(runLine(machine, 'groups julie fantome')).toMatchObject({
      stdout: 'julie : julie\n',
      stderr: "groups: 'fantome' : utilisateur inexistant\n",
    });
  });

  it('liste les sessions et redirige nano vers vim', () => {
    expect(runLine(machine, 'who').stdout).toBe(
      'hugo     pts/0        2026-11-03 09:06 (192.168.10.23)\n',
    );
    const nano = runLine(machine, 'nano notes.txt');
    expect(nano.exitCode).toBe(127);
    expect(nano.stderr).toContain('utilise vim');
  });

  describe('--help', () => {
    it('affiche l’utilisation et les options tirées du manuel', () => {
      const out = runLine(machine, 'ls --help');
      expect(out.exitCode).toBe(0);
      expect(out.stdout).toMatch(/^Utilisation : ls \[OPTION\]\.\.\. \[FICHIER\]\.\.\.\n/);
      expect(out.stdout).toContain('  -a     afficher aussi les fichiers cachés');
      expect(out.stdout.endsWith('Page de manuel complète : man ls\n')).toBe(true);
      expect(runLine(machine, 'grep -c x --help').stdout).toMatch(/^Utilisation : grep/);
    });

    it('laisse echo afficher le texte et respecte la fin des options', () => {
      expect(runLine(machine, 'echo --help').stdout).toBe('--help\n');
      expect(runLine(machine, 'grep -- --help /etc/hostname').exitCode).toBe(1);
    });
  });
});
