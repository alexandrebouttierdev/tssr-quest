import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine, runLines } from '../test-utils';

const machine = debianServer({ files: { '/home/hugo/fichier': { owner: 'hugo' } } });

describe('commande cd', () => {
  it('change de dossier et met à jour PWD', () => {
    const result = runLines(machine, ['cd /var/log', 'pwd', 'echo $PWD $OLDPWD']);

    expect(result.stdout).toBe('/var/log /home/hugo\n');
    expect(result.state.session.cwd).toBe('/var/log');
  });

  it('revient au dossier personnel sans argument ou avec ~', () => {
    expect(runLines(machine, ['cd /tmp', 'cd', 'pwd']).stdout).toBe('/home/hugo\n');
    expect(runLines(machine, ['cd /tmp', 'cd ~', 'pwd']).stdout).toBe('/home/hugo\n');
  });

  it("revient au dossier précédent avec cd - et l'affiche", () => {
    expect(runLines(machine, ['cd /tmp', 'cd /etc', 'cd -']).stdout).toBe('/tmp\n');
  });

  it('signale cd - sans dossier précédent', () => {
    expect(runLine(machine, 'cd -').stderr).toBe('bash: cd: « OLDPWD » non défini\n');
  });

  it('remonte avec ..', () => {
    expect(runLines(machine, ['cd /var/log', 'cd ..', 'pwd']).stdout).toBe('/var\n');
  });

  it('signale un dossier absent, un fichier et un dossier interdit', () => {
    expect(runLine(machine, 'cd /absent').stderr).toBe(
      'bash: cd: /absent: Aucun fichier ou dossier de ce type\n',
    );
    expect(runLine(machine, 'cd fichier').stderr).toBe("bash: cd: fichier: N'est pas un dossier\n");
    expect(runLine(machine, 'cd /root').stderr).toBe('bash: cd: /root: Permission non accordée\n');
  });

  it('refuse plusieurs arguments', () => {
    expect(runLine(machine, 'cd a b').stderr).toBe("bash: cd: trop d'arguments\n");
  });
});

describe('commandes echo, pwd, whoami, hostname', () => {
  it('affiche ses arguments', () => {
    expect(runLine(machine, 'echo  Bonjour   le monde').stdout).toBe('Bonjour le monde\n');
  });

  it('gère -n et -e', () => {
    expect(runLine(machine, 'echo -n a').stdout).toBe('a');
    expect(runLine(machine, 'echo -e "a\\tb\\nc\\\\"').stdout).toBe('a\tb\nc\\\n');
    expect(runLine(machine, 'echo -e "\\0101"').stdout).toBe('A\n');
    expect(runLine(machine, 'echo -E "a\\tb"').stdout).toBe('a\\tb\n');
  });

  it('affiche le dossier courant et le compte', () => {
    expect(runLine(machine, 'pwd').stdout).toBe('/home/hugo\n');
    expect(runLine(machine, 'whoami').stdout).toBe('hugo\n');
  });

  it('affiche le nom et les adresses de la machine', () => {
    expect(runLine(machine, 'hostname').stdout).toBe('srv-web01\n');
    expect(runLine(machine, 'hostname -I').stdout).toBe('192.168.10.20 \n');
  });
});

describe('commandes true, false, exit, export, clear', () => {
  it('renvoie 0 ou 1', () => {
    expect(runLine(machine, 'true').exitCode).toBe(0);
    expect(runLine(machine, 'false').exitCode).toBe(1);
  });

  it('ferme la session avec un code donné', () => {
    expect(runLine(machine, 'exit 3').exitCode).toBe(3);
    expect(runLine(machine, 'exit abc').exitCode).toBe(2);
    expect(runLine(machine, 'logout').effects).toEqual([{ type: 'exit' }]);
  });

  it('exporte une variable', () => {
    const result = runLines(machine, ['export EDITOR=vim', 'echo $EDITOR']);

    expect(result.stdout).toBe('vim\n');
  });

  it('liste les variables exportées et refuse un nom invalide', () => {
    expect(runLine(machine, 'export').stdout).toContain('declare -x HOME="/home/hugo"');
    expect(runLine(machine, 'export 1A=b').stderr).toBe(
      'bash: export: « 1A=b » : identifiant non valable\n',
    );
  });

  it("demande d'effacer l'écran", () => {
    expect(runLine(machine, 'clear').effects).toEqual([{ type: 'clear' }]);
  });
});

describe('aide et man', () => {
  it('liste les commandes de la simulation', () => {
    const out = runLine(machine, 'aide').stdout;

    expect(out).toContain('Commandes disponibles dans cette simulation :');
    expect(out).toMatch(/ {2}systemctl +pilote les services \(systemd\)/);
    expect(runLine(machine, 'help').stdout).toBe(out);
  });

  it('affiche la page de manuel en français', () => {
    const out = runLine(machine, 'man ls').stdout;

    expect(out.split('\n')[0]).toBe(
      'LS(1)                     Page simplifiée TSSR Quest                     LS(1)',
    );
    expect(out).toContain("ls - lister le contenu d'un répertoire");
  });

  it('signale une page absente et une demande vide', () => {
    expect(runLine(machine, 'man inconnu')).toMatchObject({
      stderr: "Il n'y a pas de page de manuel pour inconnu.\n",
      exitCode: 16,
    });
    expect(runLine(machine, 'man').stderr).toBe(
      'Quelle page de manuel voulez-vous ?\nPar exemple, essayez « man man ».\n',
    );
  });

  it('a une page de manuel pour chaque commande', () => {
    for (const name of [
      'cat',
      'cd',
      'clear',
      'curl',
      'df',
      'du',
      'echo',
      'exit',
      'export',
      'false',
      'hostname',
      'journalctl',
      'man',
      'pwd',
      'rm',
      'sudo',
      'systemctl',
      'true',
      'whoami',
      'aide',
    ]) {
      expect(runLine(machine, `man ${name}`).stdout, name).toContain('NOM');
    }
  });
});

describe('commande sudo', () => {
  it('refuse un compte hors du groupe sudo', () => {
    const julie = debianServer({ user: 'julie' });

    expect(runLine(julie, 'sudo whoami').stderr).toBe(
      "julie n'apparaît pas dans le fichier sudoers. Cet incident a été signalé à l'administrateur.\n",
    );
  });

  it('exécute sous un autre compte avec -u', () => {
    expect(runLine(machine, 'sudo -u julie whoami').stdout).toBe('julie\n');
    expect(runLine(machine, 'sudo -- whoami').stdout).toBe('root\n');
  });

  it("signale un compte inconnu, une option non simulée et l'absence de commande", () => {
    expect(runLine(machine, 'sudo -u fantome ls').stderr).toBe(
      'sudo: utilisateur inconnu : fantome\n',
    );
    expect(runLine(machine, 'sudo -i').stderr).toContain("l'option -i n'est pas disponible");
    expect(runLine(machine, 'sudo').stderr).toContain('utilisation : sudo');
  });
});
