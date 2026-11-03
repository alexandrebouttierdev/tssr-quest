import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { bashSimulator } from './simulator';
import { testContext } from './test-utils';

const machine = debianServer({
  files: { '/home/hugo/notes.txt': { owner: 'hugo' }, '/home/hugo/docs/a.txt': { owner: 'hugo' } },
});

describe('simulateur Bash', () => {
  it("affiche l'invite de Debian avec ~ pour le dossier personnel", () => {
    expect(bashSimulator.prompt(machine)).toBe('hugo@srv-web01:~$');
    const moved = bashSimulator.exec(machine, 'cd docs', testContext()).state;
    expect(bashSimulator.prompt(moved)).toBe('hugo@srv-web01:~/docs$');
    const tmp = bashSimulator.exec(machine, 'cd /tmp', testContext()).state;
    expect(bashSimulator.prompt(tmp)).toBe('hugo@srv-web01:/tmp$');
  });

  it("termine l'invite de root par #", () => {
    expect(bashSimulator.prompt(debianServer({ users: [], user: 'root' }))).toBe(
      'root@srv-web01:~#',
    );
  });

  it('exécute une ligne et sépare les sorties tout en gardant leur ordre', () => {
    const result = bashSimulator.exec(machine, 'echo a; ls /absent; echo b', testContext());

    expect(result.stdout).toBe('a\nb\n');
    expect(result.stderr).toContain("impossible d'accéder");
    expect(result.output?.map((o) => o.stream)).toEqual(['stdout', 'stderr', 'stdout']);
    expect(result.exitCode).toBe(0);
  });

  it('complète les noms de commandes', () => {
    expect(bashSimulator.complete(machine, 'sys')).toEqual(['systemctl']);
    expect(bashSimulator.complete(machine, 'sudo jour')).toEqual(['journalctl']);
  });

  it('complète les chemins, avec / pour les dossiers', () => {
    expect(bashSimulator.complete(machine, 'cat no')).toEqual(['notes.txt']);
    expect(bashSimulator.complete(machine, 'cd d')).toEqual(['docs/']);
    expect(bashSimulator.complete(machine, 'cat docs/')).toEqual(['docs/a.txt']);
    expect(bashSimulator.complete(machine, 'ls /va')).toEqual(['/var/']);
    expect(bashSimulator.complete(machine, 'ls .b')).toEqual(['.bashrc']);
    expect(bashSimulator.complete(machine, 'ls /root/')).toEqual([]);
  });

  it('affiche la bannière de connexion SSH', () => {
    const banner = bashSimulator.banner(machine, testContext());

    expect(banner.split('\n')[0]).toBe(
      'Linux srv-web01 6.1.0-26-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.112-1 (2024-09-30) x86_64',
    );
    expect(banner).toContain('Debian GNU/Linux comes with ABSOLUTELY NO WARRANTY');
    expect(banner.split('\n').at(-1)).toBe(
      'Last login: Tue Nov  3 09:06:44 2026 from 192.168.10.23',
    );
  });
});
