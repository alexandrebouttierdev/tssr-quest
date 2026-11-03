import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine, runLines } from '../test-utils';

const CONF = 'Listen 80\n#PermitRootLogin yes\nServerName intranet\nListen 443\n';
const machine = debianServer({
  files: { '/home/hugo/app.conf': { owner: 'hugo', content: CONF } },
});

describe('sed', () => {
  it('remplace la première occurrence, ou toutes avec g', () => {
    expect(runLine(machine, "sed 's/Listen/Ecoute/' app.conf").stdout).toBe(
      'Ecoute 80\n#PermitRootLogin yes\nServerName intranet\nEcoute 443\n',
    );
    expect(runLine(machine, "echo aaa | sed 's/a/b/'").stdout).toBe('baa\n');
    expect(runLine(machine, "echo aaa | sed 's/a/b/g'").stdout).toBe('bbb\n');
    expect(runLine(machine, "echo aaa | sed 's/a/b/2'").stdout).toBe('aba\n');
    expect(runLine(machine, "echo Abc | sed 's/a/x/i'").stdout).toBe('xbc\n');
  });

  it('gère les groupes, & et les autres délimiteurs', () => {
    expect(runLine(machine, "echo 'nom=hugo' | sed 's/\\(.*\\)=\\(.*\\)/\\2 \\1/'").stdout).toBe(
      'hugo nom\n',
    );
    expect(runLine(machine, "echo 'nom=hugo' | sed -E 's/(.*)=(.*)/\\2/'").stdout).toBe('hugo\n');
    expect(runLine(machine, "echo 80 | sed 's/[0-9]*/[&]/'").stdout).toBe('[80]\n');
    expect(runLine(machine, "echo /var/log | sed 's|/var|/srv|'").stdout).toBe('/srv/log\n');
  });

  it('supprime et affiche des lignes selon leur adresse', () => {
    expect(runLine(machine, "sed '2d' app.conf").stdout).toBe(
      'Listen 80\nServerName intranet\nListen 443\n',
    );
    expect(runLine(machine, "sed '$d' app.conf").stdout).toBe(
      'Listen 80\n#PermitRootLogin yes\nServerName intranet\n',
    );
    expect(runLine(machine, "sed '/^#/d' app.conf").stdout).toBe(
      'Listen 80\nServerName intranet\nListen 443\n',
    );
    expect(runLine(machine, "sed -n '3p' app.conf").stdout).toBe('ServerName intranet\n');
    expect(runLine(machine, "sed -n '2,3p' app.conf").stdout).toBe(
      '#PermitRootLogin yes\nServerName intranet\n',
    );
    expect(runLine(machine, "sed -n '/Root/,/Server/p' app.conf").stdout).toBe(
      '#PermitRootLogin yes\nServerName intranet\n',
    );
    expect(runLine(machine, "sed -n 's/Listen/L/p' app.conf").stdout).toBe('L 80\nL 443\n');
    expect(runLine(machine, "sed -e '1d' -e '2d' app.conf").stdout).toBe(
      'ServerName intranet\nListen 443\n',
    );
    expect(runLine(machine, "sed '1d;$d' app.conf").stdout).toBe(
      '#PermitRootLogin yes\nServerName intranet\n',
    );
  });

  it('modifie le fichier lui-même avec -i, selon les droits', () => {
    const result = runLines(machine, [
      "sed -i 's/^#PermitRootLogin.*/PermitRootLogin no/' app.conf",
      'cat app.conf',
    ]);

    expect(result.stdout).toBe('Listen 80\nPermitRootLogin no\nServerName intranet\nListen 443\n');
    expect(runLine(machine, "sed -i 's/a/b/' /etc/hostname").exitCode).toBe(4);
    expect(
      runLine(machine, "sudo sed -i 's/srv-web01/srv-web02/' /etc/hostname").state.fs[
        '/etc/hostname'
      ],
    ).toMatchObject({ content: 'srv-web02\n' });
  });

  it('signale les erreurs de script et de fichier', () => {
    expect(runLine(machine, "sed 's/a/b' app.conf").stderr).toBe(
      'sed: -e expression n°1, caractère 6 : commande « s » inachevée\n',
    );
    expect(runLine(machine, "sed 'x' app.conf").stderr).toBe(
      'sed: -e expression n°1, caractère 1 : commande inconnue : « x »\n',
    );
    expect(runLine(machine, "sed '/abc d' app.conf").stderr).toBe(
      'sed: expression régulière non terminée\n',
    );
    expect(runLine(machine, "sed 's/[/x/' app.conf").stderr).toContain(
      'expression régulière invalide',
    );
    expect(runLine(machine, 'sed 1d absent').stderr).toBe(
      'sed: impossible de lire absent: Aucun fichier ou dossier de ce type\n',
    );
    expect(runLine(machine, 'sed').exitCode).toBe(1);
    expect(runLine(machine, 'sed -z 1d').exitCode).toBe(1);
    expect(runLine(machine, "sed '1dx' app.conf").stderr).toContain('caractères inutiles');
  });
});
