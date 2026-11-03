import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { bashSimulator } from '../simulator';
import { runLine, runLines } from '../test-utils';

const machine = debianServer({ groups: { compta: [] } });

describe('useradd et adduser', () => {
  it('crée un compte sans dossier ni mot de passe par défaut, comme Debian', () => {
    const state = runLine(machine, 'sudo useradd bob').state;

    expect(state.users['bob']).toMatchObject({
      uid: 1002,
      group: 'bob',
      home: '/home/bob',
      shell: '/bin/sh',
      password: null,
    });
    expect(state.fs['/home/bob']).toBeUndefined();
    expect(runLine(state, 'cat /etc/passwd').stdout).toContain(
      'bob:x:1002:1002::/home/bob:/bin/sh',
    );
  });

  it('crée le dossier personnel avec -m et applique les options', () => {
    const state = runLine(
      machine,
      'sudo useradd -m -s /bin/bash -c "Julie Martin" -G compta,sudo jmartin',
    ).state;

    expect(state.users['jmartin']).toMatchObject({ shell: '/bin/bash', gecos: 'Julie Martin' });
    expect(state.fs['/home/jmartin']).toMatchObject({ type: 'dir', owner: 'jmartin', mode: 0o700 });
    expect(state.fs['/home/jmartin/.bashrc']).toMatchObject({ owner: 'jmartin' });
    expect(runLine(state, 'id jmartin').stdout).toContain('27(sudo)');
    expect(
      runLine(machine, 'sudo useradd -r -g compta -d /srv/app -u 150 app').state.users['app'],
    ).toMatchObject({ uid: 150, group: 'compta', home: '/srv/app' });
  });

  it('refuse les cas invalides', () => {
    expect(runLine(machine, 'useradd bob').stderr).toBe(
      'useradd : Permission non accordée.\nuseradd : impossible de verrouiller /etc/passwd ; réessayez plus tard.\n',
    );
    expect(runLine(machine, 'sudo useradd julie').stderr).toBe(
      "useradd : l'utilisateur « julie » existe déjà\n",
    );
    expect(runLine(machine, 'sudo useradd -G fantome bob').stderr).toBe(
      "useradd : le groupe « fantome » n'existe pas\n",
    );
    expect(runLine(machine, 'sudo useradd compta').stderr).toContain('le groupe compta existe');
    expect(runLine(machine, 'sudo useradd Bob').stderr).toContain(
      "n'est pas un nom d'utilisateur valide",
    );
    expect(runLine(machine, 'sudo useradd -u 1000 bob').stderr).toBe(
      "useradd : l'UID 1000 n'est pas unique\n",
    );
    expect(runLine(machine, 'sudo useradd').exitCode).toBe(2);
    expect(runLine(machine, 'sudo useradd -Z bob').exitCode).toBe(2);
  });

  it('guide la création complète avec adduser', () => {
    const steps = runLines(machine, [
      'sudo adduser bob',
      'Secret123',
      'Secret123',
      'Bob Dupont',
      '',
      '',
      '',
      '',
      'o',
    ]);

    expect(steps.state.users['bob']).toMatchObject({
      password: 'Secret123',
      gecos: 'Bob Dupont,,,,',
      shell: '/bin/bash',
    });
    expect(steps.state.groups['users']?.members).toContain('bob');
    expect(steps.stdout).toContain("Ajout de l'utilisateur « bob » au groupe « users »");
    const first = runLine(machine, 'sudo adduser bob');
    expect(first.stdout).toContain('Création du répertoire personnel « /home/bob »');
    expect(bashSimulator.prompt(first.state)).toBe('Nouveau mot de passe :');
    expect(
      runLines(machine, ['sudo adduser bob', 'a', 'a', 'x', '', '', '', '', 'n']).state.session
        .pending?.kind,
    ).toBe('adduser-gecos');
  });

  it('ajoute un compte existant à un groupe avec adduser', () => {
    expect(runLine(machine, 'sudo adduser julie compta').state.groups['compta']?.members).toEqual([
      'julie',
    ]);
    expect(
      runLines(machine, ['sudo adduser julie compta', 'sudo adduser julie compta']).stdout,
    ).toContain('appartient déjà');
    expect(runLine(machine, 'sudo adduser fantome compta').exitCode).toBe(1);
    expect(runLine(machine, 'sudo adduser julie fantome').exitCode).toBe(1);
    expect(runLine(machine, 'adduser bob').exitCode).toBe(1);
    expect(runLine(machine, 'sudo adduser julie').stderr).toContain('existe déjà');
    expect(runLine(machine, 'sudo adduser').exitCode).toBe(1);
  });
});

describe('usermod, userdel, groupes', () => {
  it('ajoute à des groupes avec -aG, ou remplace avec -G seul', () => {
    const added = runLines(machine, [
      'sudo usermod -aG compta julie',
      'sudo usermod -aG sudo julie',
    ]).state;
    expect(added.groups['compta']?.members).toContain('julie');
    expect(added.groups['sudo']?.members).toContain('julie');

    const replaced = runLine(added, 'sudo usermod -G compta julie').state;
    expect(replaced.groups['sudo']?.members).not.toContain('julie');
    expect(runLine(machine, 'sudo usermod -a julie').stderr).toContain(
      "ne peut être utilisée qu'avec l'option -G",
    );
  });

  it('change le shell, verrouille, renomme, déplace le dossier, fixe une expiration', () => {
    const state = runLines(machine, [
      'sudo usermod -s /usr/sbin/nologin -L -e 2026-12-31 -c "J. M." julie',
    ]).state;
    expect(state.users['julie']).toMatchObject({
      shell: '/usr/sbin/nologin',
      locked: true,
      expires: '2026-12-31',
      gecos: 'J. M.',
    });
    expect(runLine(state, 'sudo usermod -U julie').state.users['julie']?.locked).toBe(false);
    expect(runLine(machine, 'sudo usermod -l jmartin julie').state.users['jmartin']).toBeDefined();
    expect(
      runLine(machine, 'sudo usermod -d /srv/julie -m julie').state.fs['/srv/julie/.bashrc'],
    ).toBeDefined();
    expect(runLine(machine, 'sudo usermod -g compta julie').state.users['julie']?.group).toBe(
      'compta',
    );
  });

  it('signale les erreurs de usermod', () => {
    expect(runLine(machine, 'usermod -L julie').exitCode).toBe(1);
    expect(runLine(machine, 'sudo usermod -L fantome').stderr).toBe(
      "usermod : l'utilisateur « fantome » n'existe pas\n",
    );
    expect(runLine(machine, 'sudo usermod -g fantome julie').exitCode).toBe(6);
    expect(runLine(machine, 'sudo usermod -G fantome julie').exitCode).toBe(6);
    expect(runLine(machine, 'sudo usermod -l hugo julie').exitCode).toBe(9);
    expect(runLine(machine, 'sudo usermod -Z julie').exitCode).toBe(2);
  });

  it('supprime un compte, avec son dossier en -r', () => {
    const state = runLine(machine, 'sudo userdel -r julie').state;
    expect(state.users['julie']).toBeUndefined();
    expect(state.groups['julie']).toBeUndefined();
    expect(state.fs['/home/julie']).toBeUndefined();
    expect(runLine(machine, 'sudo userdel julie').state.fs['/home/julie']).toBeDefined();
    expect(runLine(machine, 'sudo userdel hugo').stderr).toContain(
      'est actuellement utilisé par le processus',
    );
    expect(runLine(machine, 'sudo userdel fantome').exitCode).toBe(6);
    expect(runLine(machine, 'userdel julie').exitCode).toBe(1);
  });

  it('crée et supprime des groupes, gère leurs membres', () => {
    const state = runLines(machine, ['sudo groupadd rh', 'sudo gpasswd -a julie rh']).state;
    expect(state.groups['rh']).toMatchObject({ gid: 1100 + 1, members: ['julie'] });
    expect(runLine(state, 'sudo gpasswd -d julie rh').state.groups['rh']?.members).toEqual([]);
    expect(runLine(state, 'sudo groupdel rh').state.groups['rh']).toBeUndefined();
    expect(runLine(machine, 'sudo groupadd -g 2000 -r web').state.groups['web']?.gid).toBe(2000);
    expect(runLine(machine, 'sudo groupadd compta').stderr).toBe(
      'groupadd : le groupe « compta » existe déjà\n',
    );
    expect(runLine(machine, 'sudo groupadd -f compta').exitCode).toBe(0);
    expect(runLine(machine, 'sudo groupadd -g 1000 x').exitCode).toBe(4);
    expect(runLine(machine, 'sudo groupadd Rh').exitCode).toBe(3);
    expect(runLine(machine, 'groupadd rh').exitCode).toBe(10);
    expect(runLine(machine, 'sudo groupadd -Z x').exitCode).toBe(2);
    expect(runLine(machine, 'sudo groupdel julie').stderr).toBe(
      "groupdel : impossible de supprimer le groupe primaire de l'utilisateur « julie »\n",
    );
    expect(runLine(machine, 'sudo groupdel fantome').exitCode).toBe(6);
    expect(runLine(machine, 'groupdel compta').exitCode).toBe(10);
    expect(runLine(machine, 'sudo gpasswd -d julie compta').exitCode).toBe(3);
    expect(runLine(machine, 'sudo gpasswd -a fantome compta').exitCode).toBe(3);
    expect(runLine(machine, 'sudo gpasswd -a julie fantome').exitCode).toBe(3);
    expect(runLine(machine, 'gpasswd -a julie compta').exitCode).toBe(3);
    expect(runLine(machine, 'gpasswd compta').exitCode).toBe(2);
  });
});

describe('passwd, chage, su', () => {
  it('change le mot de passe de root pour un autre compte, avec saisie masquée', () => {
    const asked = runLine(machine, 'sudo passwd julie');
    expect(asked.state.session.pending).toMatchObject({
      secret: true,
      prompt: 'Nouveau mot de passe : ',
    });

    const done = runLines(machine, ['sudo passwd julie', 'Nouveau1', 'Nouveau1']);
    expect(done.stdout).toBe('passwd : le mot de passe a été mis à jour avec succès\n');
    expect(done.state.users['julie']?.password).toBe('Nouveau1');
    expect(runLines(machine, ['sudo passwd julie', 'a', 'b']).stderr).toContain(
      'Les mots de passe ne correspondent pas.',
    );
    expect(runLines(machine, ['sudo passwd julie', '']).stderr).toContain(
      "Aucun mot de passe n'a été fourni.",
    );
  });

  it("demande l'ancien mot de passe à un utilisateur", () => {
    expect(
      runLines(machine, ['passwd', 'hugo', 'Neuf', 'Neuf']).state.users['hugo']?.password,
    ).toBe('Neuf');
    expect(runLines(machine, ['passwd', 'faux']).stderr).toContain("Erreur d'authentification");
    expect(runLine(machine, 'passwd julie').exitCode).toBe(1);
    expect(runLine(machine, 'passwd fantome').exitCode).toBe(1);
  });

  it("verrouille, force le changement, affiche l'état", () => {
    expect(runLine(machine, 'sudo passwd -l julie').state.users['julie']?.locked).toBe(true);
    expect(runLine(machine, 'sudo passwd -u julie').state.users['julie']?.locked).toBe(false);
    expect(runLine(machine, 'sudo passwd -e julie').state.users['julie']?.lastChange).toBe(0);
    expect(runLine(machine, 'sudo passwd -d julie').state.users['julie']?.password).toBeNull();
    expect(runLine(machine, 'passwd -S').stdout).toMatch(
      /^hugo P \d\d\/\d\d\/2026 0 99999 7 -1\n$/,
    );
    expect(runLine(machine, 'passwd -l hugo').exitCode).toBe(1);
    expect(runLine(machine, 'passwd -z').exitCode).toBe(2);
  });

  it("gère l'expiration avec chage", () => {
    const state = runLine(machine, 'sudo chage -M 90 -m 1 -W 14 -E 2027-06-30 julie').state;
    const out = runLine(state, 'sudo chage -l julie').stdout;
    expect(out).toMatch(/Nombre maximum de jours entre les changements de mot de passe +: 90/);
    expect(out).toContain(
      'Fin de validité du compte                                       : juin 30, 2027',
    );
    expect(runLines(machine, ['sudo chage -d 0 julie', 'sudo chage -l julie']).stdout).toContain(
      'le mot de passe doit être changé',
    );
    expect(runLine(machine, 'chage -l hugo').stdout).toContain('Expiration du mot de passe');
    expect(runLine(machine, 'chage -l julie').exitCode).toBe(1);
    expect(runLine(machine, 'chage -M 5 hugo').exitCode).toBe(1);
    expect(runLine(machine, 'chage -l fantome').exitCode).toBe(1);
    expect(runLine(machine, 'sudo chage -E -1 julie').state.users['julie']?.expires).toBeNull();
    expect(runLine(machine, 'chage -Z hugo').exitCode).toBe(2);
  });

  it('ouvre une session sous un autre compte, puis revient avec exit', () => {
    const asJulie = runLines(machine, ['su - julie', 'julie']);
    expect(asJulie.state.session).toMatchObject({ user: 'julie', cwd: '/home/julie' });
    expect(bashSimulator.prompt(asJulie.state)).toBe('julie@srv-web01:~$');
    expect(runLine(asJulie.state, 'exit').state.session.user).toBe('hugo');
    expect(runLines(machine, ['su julie', 'faux']).stderr).toBe(
      "su: Échec de l'authentification\n",
    );
    expect(runLine(machine, 'sudo su').state.session.user).toBe('root');
    expect(runLine(machine, 'sudo -i').state.session).toMatchObject({ user: 'root', cwd: '/root' });
    expect(runLine(machine, 'sudo -s').state.session).toMatchObject({
      user: 'root',
      cwd: '/home/hugo',
    });
    expect(runLine(machine, 'su fantome').exitCode).toBe(1);
    expect(runLine(debianServer({ user: 'julie' }), 'sudo -i').state.session.user).toBe('julie');
  });
});
