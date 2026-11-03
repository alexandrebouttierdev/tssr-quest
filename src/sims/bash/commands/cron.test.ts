import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import type { SimEffect } from '@sims/shared/simulator';
import { bashSimulator } from '../simulator';
import { runLine, runLines, testContext } from '../test-utils';

const machine = debianServer({});

describe('crontab', () => {
  it("n'a pas de table au départ, et en installe une depuis un fichier ou l'entrée standard", () => {
    expect(runLine(machine, 'crontab -l').stderr).toBe('no crontab for hugo\n');
    const fromPipe = runLine(machine, 'echo "30 2 * * * /usr/local/bin/sauvegarde.sh" | crontab -');
    expect(fromPipe.exitCode).toBe(0);
    expect(runLine(fromPipe.state, 'crontab -l').stdout).toBe(
      '30 2 * * * /usr/local/bin/sauvegarde.sh\n',
    );
    // Ajout d'une ligne au tube, la recette classique.
    const appended = runLine(
      fromPipe.state,
      '(crontab -l; echo "@reboot /usr/local/bin/demarrage.sh") | crontab -',
    ).state;
    expect(appended.crontabs['hugo']).toHaveLength(2);
    const fromFile = runLines(machine, [
      'echo "0 * * * * /bin/true" > ma-table',
      'crontab ma-table',
    ]);
    expect(fromFile.state.crontabs['hugo']).toEqual([
      { schedule: '0 * * * *', command: '/bin/true' },
    ]);
  });

  it('refuse une table invalide ou sans saut de ligne final', () => {
    expect(runLine(machine, 'echo "61 * * * * x" | crontab -').stderr).toBe(
      '"-":1: bad minute\nerrors in crontab file, can\'t install.\n',
    );
    expect(runLine(machine, 'printf "0 * * * * x" | crontab -').stderr).toBe(
      "new crontab file is missing newline before EOF, can't install.\n",
    );
    expect(runLine(machine, 'crontab absent').stderr).toBe('absent: No such file or directory\n');
  });

  it('supprime la table et gère -u en root', () => {
    const installed = runLine(machine, 'echo "0 * * * * x" | crontab -').state;
    expect(runLine(installed, 'crontab -r').state.crontabs['hugo']).toBeUndefined();
    expect(runLine(machine, 'crontab -r').stderr).toBe('no crontab for hugo\n');
    expect(runLine(machine, 'crontab -u julie -l').stderr).toBe('must be privileged to use -u\n');
    expect(runLine(installed, 'sudo crontab -u hugo -l').stdout).toBe('0 * * * * x\n');
    expect(runLine(machine, 'sudo crontab -u fantome -l').exitCode).toBe(1);
    expect(runLine(machine, 'crontab').exitCode).toBe(1);
    expect(runLine(machine, 'crontab -x').exitCode).toBe(1);
  });

  it('ouvre vim sur une copie, puis installe la table à la fermeture', () => {
    const opened = runLine(machine, 'crontab -e');
    expect(opened.stderr).toBe('no crontab for hugo - using an empty one\n');
    const effect = opened.effects[0] as unknown as SimEffect;
    if (effect.type !== 'open-editor' || !effect.onClose) throw new Error('éditeur attendu');
    expect(effect.path).toMatch(/^\/tmp\/crontab\.[A-Za-z0-9]{6}\/crontab$/);
    const hook = effect.onClose;
    // Sans modification : rien n'est installé.
    const unchanged = bashSimulator.afterEdit?.(opened.state, hook, testContext());
    expect(unchanged?.stderr).toBe('crontab: no changes made to crontab\n');
    // Avec une ligne ajoutée : la table est installée et le fichier temporaire supprimé.
    const node = opened.state.fs[hook.file];
    const edited = {
      ...opened.state,
      fs: {
        ...opened.state.fs,
        [hook.file]: { ...node!, content: `${hook.original}0 3 * * * /bin/true\n` } as typeof node &
          object,
      },
    };
    const installed = bashSimulator.afterEdit?.(edited, hook, testContext());
    expect(installed?.stderr).toBe('crontab: installing new crontab\n');
    expect(installed?.state.crontabs['hugo']).toEqual([
      { schedule: '0 3 * * *', command: '/bin/true' },
    ]);
    expect(installed?.state.fs[hook.file]).toBeUndefined();
    // Avec une erreur : rien n'est installé, l'édition reste dans le fichier temporaire.
    const broken = {
      ...opened.state,
      fs: {
        ...opened.state.fs,
        [hook.file]: { ...node!, content: 'x * * * * y\n' } as typeof node & object,
      },
    };
    expect(bashSimulator.afterEdit?.(broken, hook, testContext())?.stderr).toContain(
      `"${hook.file}":1: bad minute\nerrors in crontab file, can't install.\ncrontab: edits left in ${hook.file}\n`,
    );
  });
});

describe('at', () => {
  const withAt = runLine(machine, 'sudo apt install -y at').state;

  it("n'existe qu'une fois le paquet installé", () => {
    expect(runLine(machine, 'at 23:00').stderr).toBe('bash: at : commande introuvable\n');
  });

  it('programme un travail par un tube, le liste et le supprime', () => {
    const programmed = runLine(withAt, 'echo "systemctl restart apache2" | at 23:00');
    expect(programmed.stderr).toBe(
      'warning: commands will be executed using /bin/sh\njob 1 at Tue Nov  3 23:00:00 2026\n',
    );
    expect(runLine(programmed.state, 'atq').stdout).toBe('1\tTue Nov  3 23:00:00 2026 a hugo\n');
    expect(runLine(programmed.state, 'atrm 1').state.atJobs).toEqual([]);
    expect(runLine(programmed.state, 'atrm 7').stderr).toBe('Cannot find jobid 7\n');
    expect(runLine(withAt, 'at').stderr).toBe('Garbled time\n');
    expect(runLine(withAt, 'at plus tard').exitCode).toBe(1);
  });

  it('demande les commandes à son invite jusqu’à Ctrl+D', () => {
    const asked = runLine(withAt, 'at now + 10 minutes');
    expect(bashSimulator.prompt(asked.state)).toBe('at>');
    const done = runLines(asked.state, ['tar czf /tmp/sauvegarde.tgz /srv', '\u0004']);
    expect(done.stderr).toBe('job 1 at Tue Nov  3 09:41:00 2026\n');
    expect(done.state.atJobs?.[0]?.commands).toBe('tar czf /tmp/sauvegarde.tgz /srv\n');
    expect(runLine(machine, '\u0004').stdout).toBe('');
  });

  it('protège les travaux des autres comptes', () => {
    const rootJob = runLine(withAt, 'echo reboot | sudo at midnight').state;
    expect(runLine(rootJob, 'atq').stdout).toBe('');
    expect(runLine(rootJob, 'atrm 1').stderr).toBe('1: Not owner\n');
  });
});
