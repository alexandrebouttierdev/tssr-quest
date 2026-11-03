import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine } from '../test-utils';

const machine = debianServer({
  files: { '/home/hugo/a.txt': { content: 'un\ndeux\n', owner: 'hugo' } },
});

describe('commande cat', () => {
  it('affiche le contenu de plusieurs fichiers', () => {
    expect(runLine(machine, 'cat a.txt /etc/hostname').stdout).toBe('un\ndeux\nsrv-web01\n');
  });

  it('numérote les lignes avec -n', () => {
    expect(runLine(machine, 'cat -n a.txt').stdout).toBe('     1\tun\n     2\tdeux\n');
  });

  it("lit l'entrée standard avec -", () => {
    expect(runLine(machine, 'echo x | cat - a.txt').stdout).toBe('x\nun\ndeux\n');
  });

  it('signale un fichier absent et un dossier', () => {
    const result = runLine(machine, 'cat absent /etc a.txt');

    expect(result.stdout).toBe('un\ndeux\n');
    expect(result.stderr).toBe(
      'cat: absent: Aucun fichier ou dossier de ce type\ncat: /etc: Est un dossier\n',
    );
    expect(result.exitCode).toBe(1);
  });

  it('refuse de lire un fichier protégé', () => {
    expect(runLine(machine, 'cat /etc/shadow').stderr).toBe(
      'cat: /etc/shadow: Permission non accordée\n',
    );
    expect(runLine(machine, 'sudo cat /etc/shadow').exitCode).toBe(0);
  });

  it('refuse une option inconnue', () => {
    expect(runLine(machine, 'cat -z a.txt').exitCode).toBe(1);
  });
});
