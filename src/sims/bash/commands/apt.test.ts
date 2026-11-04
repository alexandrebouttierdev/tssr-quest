import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { bashSimulator } from '../simulator';
import { runLine, runLines } from '../test-utils';

/** Serveur avec deux mises à jour de sécurité publiées, pas encore vues. */
const outdated = debianServer({
  packages: {
    updates: {
      curl: { version: '7.88.1-10+deb12u12' },
      libcurl4: { version: '7.88.1-10+deb12u12' },
    },
  },
});

describe('apt update', () => {
  it('exige les droits root', () => {
    const result = runLine(outdated, 'apt update');

    expect(result.exitCode).toBe(100);
    expect(result.stdout).toBe('Lecture des listes de paquets... Fait\n');
    expect(result.stderr).toContain(
      "Impossible d'ouvrir le fichier verrou /var/lib/apt/lists/lock",
    );
  });

  it('télécharge les index et annonce les mises à jour', () => {
    const result = runLine(outdated, 'sudo apt update');

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Atteint :1 http://deb.debian.org/debian bookworm InRelease');
    expect(result.stdout).toMatch(
      /Réception de :\d http:\/\/security\.debian\.org\/debian-security bookworm-security InRelease \[48,0 kB\]/,
    );
    expect(result.stdout).toContain('réceptionnés en 1s');
    expect(result.stdout).toContain(
      '2 paquets peuvent être mis à jour. Exécutez « apt list --upgradable » pour les voir.',
    );
    // Une seconde mise à jour n'a plus rien à télécharger.
    expect(runLine(result.state, 'sudo apt update').stdout).not.toContain('Réception');
  });

  it("dit que tout est à jour et qu'apt-get n'en fait pas le bilan", () => {
    const clean = debianServer({});
    expect(runLine(clean, 'sudo apt update').stdout).toContain('Tous les paquets sont à jour.');
    expect(runLine(clean, 'sudo apt-get update').stdout).not.toContain('Tous les paquets');
  });

  it('signale un dépôt sans fichier Release et un hôte inconnu', () => {
    const broken = debianServer({
      files: {
        '/etc/apt/sources.list': {
          content:
            'deb http://deb.debian.org/debian bookwrom main\ndeb http://deb.debain.org/debian bookworm main\n',
        },
      },
    });
    const result = runLine(broken, 'sudo apt update');

    expect(result.exitCode).toBe(100);
    expect(result.stdout).toContain('404  Not Found');
    expect(result.stderr).toContain(
      "E: Le dépôt « http://deb.debian.org/debian bookwrom Release » n'a pas de fichier Release.",
    );
    expect(result.stdout).toContain('Impossible de résoudre « deb.debain.org »');
  });

  it('ne voit pas les mises à jour de sécurité sans le dépôt security', () => {
    const noSecurity = debianServer({
      packages: { updates: { curl: { version: '7.88.1-10+deb12u12' } } },
      files: {
        '/etc/apt/sources.list': { content: 'deb http://deb.debian.org/debian/ bookworm main\n' },
      },
    });
    expect(runLine(noSecurity, 'sudo apt update').stdout).toContain(
      'Tous les paquets sont à jour.',
    );
  });

  it('refuse une ligne de sources mal formée', () => {
    const typo = debianServer({
      files: {
        '/etc/apt/sources.list': { content: 'dep http://deb.debian.org/debian bookworm main\n' },
      },
    });
    expect(runLine(typo, 'sudo apt update').stderr).toBe(
      'E: Type « dep » inconnu sur la ligne 1 dans la liste des sources /etc/apt/sources.list\nE: Les listes de sources ne peuvent être lues.\n',
    );
  });

  it('échoue à résoudre les miroirs sans réseau', () => {
    const offline = { ...outdated, routes: [] };
    const result = runLine(offline, 'sudo apt update');
    expect(result.stdout).toContain('Échec temporaire de résolution de « deb.debian.org »');
    expect(result.stderr).toContain("W: Impossible de récupérer certains fichiers d'index");
  });
});

describe('apt list, search, show, policy', () => {
  it('liste les paquets à mettre à jour après apt update', () => {
    expect(runLine(outdated, 'apt list --upgradable').stdout).toBe('En train de lister... Fait\n');
    const updated = runLine(outdated, 'sudo apt update').state;
    expect(runLine(updated, 'apt list --upgradable').stdout).toBe(
      'En train de lister... Fait\ncurl/stable-security 7.88.1-10+deb12u12 amd64 [pouvant être mis à jour depuis : 7.88.1-10+deb12u8]\nlibcurl4/stable-security 7.88.1-10+deb12u12 amd64 [pouvant être mis à jour depuis : 7.88.1-10+deb12u8]\n',
    );
  });

  it('filtre par motif et par état, et avertit dans un tube', () => {
    expect(runLine(outdated, 'apt list --installed bash').stdout).toContain(
      'bash/stable,now 5.2.15-2+b7 amd64 [installé]',
    );
    expect(runLine(outdated, "apt list 'apache2*'").stdout).toContain('apache2-utils/stable');
    expect(runLine(outdated, 'apt list tree | cat').stderr).toContain(
      'WARNING: apt does not have a stable CLI interface',
    );
  });

  it('cherche, affiche une fiche et les versions', () => {
    expect(runLine(outdated, 'apt search directory tree').stdout).toContain(
      'tree/stable 2.1.0-1 amd64\n  displays an indented directory tree, in color',
    );
    expect(runLine(outdated, 'apt search').exitCode).toBe(100);
    const show = runLine(outdated, 'apt show apache2').stdout;
    expect(show).toContain('Depends: apache2-bin, apache2-data, apache2-utils');
    expect(show).toContain(
      'APT-Sources: http://deb.debian.org/debian bookworm/main amd64 Packages',
    );
    expect(runLine(outdated, 'apt show bash').stdout).toContain('APT-Manual-Installed: yes');
    expect(runLine(outdated, 'apt show nexiste').stderr).toBe(
      "N: Impossible de trouver le paquet nexiste\nE: Aucun paquet n'a été trouvé\n",
    );
    expect(runLine(outdated, 'apt policy tree').stdout).toContain('Installé : (aucun)');
    const updated = runLine(outdated, 'sudo apt update').state;
    expect(runLine(updated, 'apt policy curl').stdout).toContain(' *** 7.88.1-10+deb12u8 100');
    expect(runLine(outdated, 'apt policy bash').stdout).toContain(' *** 5.2.15-2+b7 500');
  });
});

describe('apt install, remove, purge, upgrade', () => {
  it('installe un paquet simple sans poser de question', () => {
    const result = runLine(outdated, 'sudo apt install tree');

    expect(result.stdout).toContain('Les NOUVEAUX paquets suivants seront installés :\n  tree\n');
    expect(result.stdout).toContain('Dépaquetage de tree (2.1.0-1) ...');
    expect(result.stdout).toContain('Paramétrage de tree (2.1.0-1) ...');
    expect(result.state.packages['tree']).toMatchObject({ installed: true });
    expect(result.state.fs['/usr/bin/tree']?.type).toBe('file');
    expect(runLine(result.state, 'which tree').stdout).toBe('/usr/bin/tree\n');
    expect(runLine(result.state, 'tree').stderr).toContain('commande non disponible');
    expect(runLine(result.state, 'cat /var/log/apt/history.log').stdout).toContain(
      'Commandline: apt install tree\nRequested-By: hugo (1000)\nInstall: tree:amd64 (2.1.0-1)',
    );
  });

  it('demande confirmation quand des dépendances arrivent, puis démarre le service', () => {
    const asked = runLine(outdated, 'sudo apt install apache2');

    expect(asked.stdout).toContain('Les paquets supplémentaires suivants seront installés :');
    expect(asked.stdout).toContain(
      '0 mis à jour, 6 nouvellement installés, 0 à enlever et 0 non mis à jour.',
    );
    expect(bashSimulator.prompt(asked.state)).toBe('Souhaitez-vous continuer ? [O/n]');

    const done = runLine(asked.state, '');
    expect(done.stdout).toContain('Sélection du paquet libapr1:amd64 précédemment désélectionné.');
    expect(done.stdout).toContain(
      'Created symlink /etc/systemd/system/multi-user.target.wants/apache2.service → /lib/systemd/system/apache2.service.',
    );
    expect(done.state.services['apache2']?.state).toBe('active');
    expect(done.state.packages['apache2-bin']?.auto).toBe(true);
    expect(done.state.fs['/etc/apache2/apache2.conf']?.type).toBe('file');
    expect(runLine(done.state, 'curl localhost').stdout).toContain('It works!');

    expect(runLines(outdated, ['sudo apt install apache2', 'n']).stderr).toBe('Annulation.\n');
    expect(runLine(outdated, 'sudo apt install -y apache2').state.services['apache2']?.state).toBe(
      'active',
    );
  });

  it("n'installe pas un service dont le port est pris", () => {
    const withNginx = debianServer({ services: { nginx: { state: 'active' } } });
    const done = runLine(withNginx, 'sudo apt install -y apache2').state;
    expect(done.services['apache2']?.state).toBe('failed');
  });

  it('signale un paquet inconnu ou déjà installé', () => {
    const missing = runLine(outdated, 'sudo apt install nexiste');
    expect(missing.exitCode).toBe(100);
    expect(missing.stderr).toBe('E: Impossible de trouver le paquet nexiste\n');
    expect(runLine(outdated, 'sudo apt install bash').stdout).toContain(
      'bash est déjà la version la plus récente (5.2.15-2+b7).',
    );
    expect(runLine(outdated, 'apt install tree').stderr).toContain(
      'Avez-vous les droits du superutilisateur ?',
    );
  });

  it('met à jour les paquets connus, seulement après apt update', () => {
    expect(runLine(outdated, 'sudo apt upgrade').stdout).toContain(
      'Calcul de la mise à jour... Fait\n0 mis à jour, 0 nouvellement installés, 0 à enlever et 0 non mis à jour.',
    );
    const updated = runLine(outdated, 'sudo apt update').state;
    expect(runLine(updated, 'sudo apt upgrade').stdout).toContain(
      'Les paquets suivants seront mis à jour :\n  curl libcurl4\n',
    );
    const steps = runLines(updated, ['sudo apt upgrade', 'o']);
    expect(steps.stdout).toContain(
      'Dépaquetage de curl (7.88.1-10+deb12u12) sur (7.88.1-10+deb12u8) ...',
    );
    expect(steps.state.packages['curl']).toMatchObject({ version: '7.88.1-10+deb12u12' });
    expect(steps.state.packages['curl']?.update).toBeUndefined();
    expect(runLine(steps.state, 'apt list --upgradable').stdout).toBe(
      'En train de lister... Fait\n',
    );
    expect(
      runLines(outdated, ['sudo apt-get update', 'sudo apt-get -y dist-upgrade']).state.packages[
        'libcurl4'
      ]?.version,
    ).toBe('7.88.1-10+deb12u12');
  });

  it('enlève un paquet en gardant sa configuration, ou la purge', () => {
    const installed = runLine(outdated, 'sudo apt install -y apache2').state;
    const plan = runLine(installed, 'sudo apt remove apache2').stdout;
    expect(plan).toContain('Les paquets suivants seront ENLEVÉS :\n  apache2\n');
    expect(plan).toContain('Veuillez utiliser « sudo apt autoremove » pour les supprimer.');

    const removed = runLines(installed, ['sudo apt remove apache2', 'o']);
    expect(removed.state.services['apache2']).toBeUndefined();
    expect(removed.state.fs['/etc/apache2/apache2.conf']).toBeDefined();
    expect(runLine(removed.state, 'dpkg -l apache2').stdout).toMatch(/^rc {2}apache2 /m);

    const auto = runLines(removed.state, ['sudo apt autoremove -y']);
    expect(auto.state.packages['apache2-bin']?.installed).toBe(false);

    const purged = runLine(removed.state, 'sudo apt purge -y apache2');
    expect(purged.stdout).toContain('Purge des fichiers de configuration de apache2');
    expect(purged.state.fs['/etc/apache2/apache2.conf']).toBeUndefined();
    expect(runLine(outdated, 'sudo apt remove tree').stdout).toContain(
      "Le paquet « tree » n'est pas installé, et ne peut donc être supprimé",
    );
  });

  it('enlève aussi les paquets qui dépendent du paquet visé, mais jamais un paquet essentiel', () => {
    const installed = runLine(outdated, 'sudo apt install -y apache2').state;
    const plan = runLine(installed, 'sudo apt remove libapr1').stdout;
    expect(plan).toContain('apache2 apache2-bin apache2-utils libapr1 libaprutil1');
    expect(runLine(outdated, 'sudo apt remove bash').stderr).toContain(
      'ATTENTION : Les paquets essentiels suivants vont être enlevés.',
    );
  });

  it('rend introuvable une commande dont le paquet est enlevé', () => {
    const removed = runLine(outdated, 'sudo apt purge -y curl').state;
    expect(runLine(removed, 'curl localhost').stderr).toBe('bash: curl : commande introuvable\n');
  });

  it('bloque tout tant que dpkg est interrompu', () => {
    const broken = debianServer({ packages: { halfConfigured: ['tree'] } });
    expect(runLine(broken, 'sudo apt install htop').stderr).toBe(
      "E: dpkg a été interrompu. Il est nécessaire d'utiliser « sudo dpkg --configure -a » pour corriger le problème.\n",
    );
    expect(runLine(broken, 'dpkg -l tree').stdout).toMatch(/^iF {2}tree /m);
    const fixed = runLine(broken, 'sudo dpkg --configure -a');
    expect(fixed.stdout).toBe('Paramétrage de tree (2.1.0-1) ...\n');
    expect(runLine(fixed.state, 'sudo apt install -y htop').state.packages['htop']?.installed).toBe(
      true,
    );
    expect(runLine(broken, 'dpkg --configure -a').exitCode).toBe(2);
    expect(runLine(broken, 'sudo dpkg --configure').exitCode).toBe(2);
  });

  it('refuse les opérations inconnues et les options inconnues', () => {
    expect(runLine(outdated, 'sudo apt frobnicate').stderr).toBe(
      'E: Opération frobnicate non valable\n',
    );
    expect(runLine(outdated, 'sudo apt dist-upgrade').exitCode).toBe(100);
    expect(runLine(outdated, 'sudo apt --zzz update').exitCode).toBe(100);
    expect(runLine(outdated, 'apt').stdout).toContain('Utilisation : apt [options] commande');
    expect(runLine(outdated, 'apt-get').exitCode).toBe(1);
    expect(runLine(outdated, 'sudo apt-get clean').exitCode).toBe(0);
  });
});

describe('dpkg', () => {
  it('liste les paquets installés', () => {
    const list = runLine(outdated, 'dpkg -l').stdout;
    expect(list).toContain('||/ Nom');
    expect(list).toMatch(/^ii {2}bash +5\.2\.15-2\+b7 +amd64 +GNU Bourne Again SHel/m);
    expect(list).not.toContain('apache2');
    expect(runLine(outdated, 'dpkg -l nginx').stderr).toBe(
      'dpkg-query: aucun paquet ne correspond à nginx\n',
    );
  });

  it('affiche les fichiers, l’état, et retrouve le paquet d’un fichier', () => {
    expect(runLine(outdated, 'dpkg -L curl').stdout).toContain(
      '/.\n/usr\n/usr/bin\n/usr/bin/curl\n',
    );
    expect(runLine(outdated, 'dpkg -L tree').stderr).toContain(
      "le paquet « tree » n'est pas installé",
    );
    expect(runLine(outdated, 'dpkg -s curl').stdout).toContain('Status: install ok installed');
    expect(runLine(outdated, 'dpkg -s tree').exitCode).toBe(1);
    expect(runLine(outdated, 'dpkg -S /usr/bin/curl').stdout).toBe('curl: /usr/bin/curl\n');
    expect(runLine(outdated, 'dpkg -S bin/dpkg').stdout).toContain('dpkg: /usr/bin/dpkg');
    expect(runLine(outdated, 'dpkg -S /nulle/part').stderr).toBe(
      'dpkg-query: aucun chemin trouvé correspondant au motif /nulle/part\n',
    );
  });

  it('enlève un paquet sans dépendants, et refuse sinon', () => {
    const withTree = runLine(outdated, 'sudo apt install tree').state;
    const removed = runLine(withTree, 'sudo dpkg -r tree');
    expect(removed.stdout).toContain('Suppression de tree (2.1.0-1) ...');
    expect(removed.state.packages['tree']?.installed).toBe(false);
    expect(runLine(outdated, 'sudo dpkg -r libcurl4').stderr).toContain(
      'dpkg: problèmes de dépendances empêchant la suppression de libcurl4 :\n curl dépend de libcurl4.',
    );
    expect(runLine(outdated, 'dpkg -r tree').exitCode).toBe(2);
    expect(runLine(outdated, 'sudo dpkg -P nexiste').exitCode).toBe(1);
  });

  it('explique comment l’utiliser', () => {
    expect(runLine(outdated, 'dpkg').stderr).toContain('dpkg: erreur: il faut indiquer une action');
    expect(runLine(outdated, 'dpkg --zz').stderr).toContain('option inconnue --zz');
  });
});
