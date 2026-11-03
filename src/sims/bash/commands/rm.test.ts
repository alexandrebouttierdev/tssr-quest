import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine } from '../test-utils';

const machine = debianServer({
  files: {
    '/home/hugo/a.txt': { owner: 'hugo' },
    '/home/hugo/projet/x.txt': { owner: 'hugo' },
    '/var/log/debug.log': { size: '18G', owner: 'root', group: 'adm', mode: '0640' },
    '/tmp/julie.txt': { owner: 'julie', mode: '0666' },
  },
});

describe('commande rm', () => {
  it('supprime un fichier sans rien afficher', () => {
    const result = runLine(machine, 'rm a.txt');

    expect(result.stdout).toBe('');
    expect(result.state.fs['/home/hugo/a.txt']).toBeUndefined();
  });

  it('refuse un dossier sans -r puis le supprime avec -r', () => {
    expect(runLine(machine, 'rm projet').stderr).toBe(
      "rm: impossible de supprimer 'projet': Est un dossier\n",
    );
    expect(runLine(machine, 'rm -r projet').state.fs['/home/hugo/projet/x.txt']).toBeUndefined();
  });

  it('refuse sans droit sur le dossier parent', () => {
    const result = runLine(machine, 'rm /var/log/debug.log');

    expect(result.stderr).toBe(
      "rm: impossible de supprimer '/var/log/debug.log': Permission non accordée\n",
    );
    expect(result.exitCode).toBe(1);
  });

  it('supprime avec sudo', () => {
    expect(
      runLine(machine, 'sudo rm /var/log/debug.log').state.fs['/var/log/debug.log'],
    ).toBeUndefined();
  });

  it('respecte le sticky bit de /tmp', () => {
    expect(runLine(machine, 'rm /tmp/julie.txt').stderr).toBe(
      "rm: impossible de supprimer '/tmp/julie.txt': Opération non permise\n",
    );
  });

  it('signale un fichier absent, sauf avec -f', () => {
    expect(runLine(machine, 'rm absent').stderr).toBe(
      "rm: impossible de supprimer 'absent': Aucun fichier ou dossier de ce type\n",
    );
    expect(runLine(machine, 'rm -f absent').exitCode).toBe(0);
  });

  it('affiche ce qui est supprimé avec -v', () => {
    expect(runLine(machine, 'rm -rv projet a.txt').stdout).toBe(
      "répertoire 'projet' supprimé\n'a.txt' supprimé\n",
    );
  });

  it('supprime un dossier vide avec -d', () => {
    const result = runLine(machine, 'mkdir_absent=1; rm -d projet');

    expect(result.stderr).toBe("rm: impossible de supprimer 'projet': Le dossier n'est pas vide\n");
  });

  it('signale un opérande manquant, sauf avec -f', () => {
    expect(runLine(machine, 'rm').stderr).toBe(
      "rm: opérande manquant\nSaisissez « rm --help » pour plus d'informations.\n",
    );
    expect(runLine(machine, 'rm -f').exitCode).toBe(0);
  });

  it('protège la racine', () => {
    expect(runLine(machine, 'sudo rm -rf /').stderr).toContain(
      "rm: il est dangereux d'opérer récursivement sur '/'",
    );
  });

  it('refuse une option inconnue', () => {
    expect(runLine(machine, 'rm -z a.txt').exitCode).toBe(1);
  });
});
