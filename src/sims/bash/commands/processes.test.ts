import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { createDebianServer } from '@sims/shared/factories';
import { runLine, runLines, TEST_NOW } from '../test-utils';

const machine = createDebianServer({
  hostname: 'srv-web01',
  users: ['hugo', 'julie'],
  sudoers: ['hugo'],
  session: { user: 'hugo' },
  services: { apache2: { state: 'active' } },
  processes: [
    { user: 'julie', command: '/usr/bin/python3 /home/julie/export.py', cpu: 97.5, rss: 812_000 },
    { user: 'hugo', command: 'yes', cpu: 12 },
  ],
});

describe('ps', () => {
  it('liste les processus du terminal', () => {
    expect(runLine(machine, 'ps').stdout).toBe(
      '    PID TTY          TIME CMD\n   1187 pts/0    00:00:00 bash\n   2200 pts/0    00:00:00 ps\n',
    );
  });

  it('liste tous les processus en format BSD (aux) et trie par CPU', () => {
    const out = runLine(machine, 'ps aux --sort=-%cpu').stdout.split('\n');

    expect(out[0]).toMatch(/^USER +PID %CPU %MEM +VSZ +RSS TTY +STAT START +TIME COMMAND$/);
    expect(out[1]).toMatch(
      /^julie +1500 97\.5 40\.4 2436000 812000 \? +R +04:26 +298:05 \/usr\/bin\/python3 \/home\/julie\/export\.py$/,
    );
    expect(runLine(machine, 'ps aux').stdout).toMatch(
      /\nroot +1 +0\.0 +0\.6 +167740 +12288 \? +Ss +oct\.22 +0:00 \/sbin\/init\n/,
    );
    expect(runLine(machine, 'ps aux --sort=-%mem').stdout.split('\n')[1]).toContain('julie');
    expect(runLine(machine, 'ps aux --sort=%cpu').stdout.split('\n')[1]).toContain('root');
    expect(runLine(machine, 'ps aux --sort=pid').stdout.split('\n')[1]).toContain('/sbin/init');
  });

  it('liste en format System V (-ef), par compte ou par PID', () => {
    expect(runLine(machine, 'ps -ef').stdout.split('\n')[0]).toMatch(
      /^UID +PID +PPID +C STIME +TTY +TIME CMD$/,
    );
    expect(runLine(machine, 'ps -u julie').stdout).toContain('python3');
    expect(runLine(machine, 'ps -p 1').stdout).toContain('init');
    expect(runLine(machine, 'ps -p 99999').exitCode).toBe(1);
    expect(runLine(machine, 'ps -u fantome').exitCode).toBe(1);
  });
});

describe('top', () => {
  it('affiche un instantané trié par %CPU, avec la charge et la mémoire', () => {
    const out = runLine(machine, 'top').stdout.split('\n');

    expect(out[0]).toBe(
      'top - 09:31:44 up 12 days,  3:05,  1 user,  load average: 1,09, 0,66, 0,33',
    );
    expect(out[1]).toMatch(/^Tâches: +\d+ total/);
    expect(out[3]).toMatch(/^MiB Mem :/);
    expect(out[6]).toMatch(/PID UTIL\. +PR +NI +VIRT +RES +SHR S +%CPU +%MEM +TEMPS\+ COM\./);
    expect(out[7]).toMatch(/1500 julie .* R +97,5 +40,4 .* python3$/);
  });
});

describe('kill et killall', () => {
  it('arrête un processus du compte, par TERM ou KILL', () => {
    const pid = machine.processes.find((p) => p.command === 'yes')?.pid;
    expect(runLine(machine, `kill ${pid}`).state.processes.some((p) => p.pid === pid)).toBe(false);
    expect(runLine(machine, `kill -9 ${pid}`).exitCode).toBe(0);
    expect(runLine(machine, `kill -SIGKILL ${pid}`).exitCode).toBe(0);
    expect(runLine(machine, `kill -s TERM ${pid}`).exitCode).toBe(0);
  });

  it("refuse les processus d'un autre compte, sauf avec sudo", () => {
    expect(runLine(machine, 'kill 1500').stderr).toBe(
      'bash: kill: (1500) - Opération non permise\n',
    );
    expect(runLine(machine, 'sudo kill 1500').state.processes.some((p) => p.pid === 1500)).toBe(
      false,
    );
  });

  it('signale les processus inexistants et les erreurs de syntaxe', () => {
    expect(runLine(machine, 'kill 99999').stderr).toBe(
      'bash: kill: (99999) - Aucun processus de ce type\n',
    );
    expect(runLine(machine, 'kill -BIDULE 1').stderr).toBe(
      'bash: kill: BIDULE : spécification de signal non valable\n',
    );
    expect(runLine(machine, 'kill abc').stderr).toContain(
      'les arguments doivent être des identifiants',
    );
    expect(runLine(machine, 'kill').exitCode).toBe(2);
    expect(runLine(machine, 'kill %3').stderr).toBe('bash: kill: %3 : tâche inexistante\n');
  });

  it('liste les signaux', () => {
    expect(runLine(machine, 'kill -l').stdout.split('\n')[1]).toBe(
      ' 6) SIGABRT\t 7) SIGBUS\t 8) SIGFPE\t 9) SIGKILL\t10) SIGUSR1',
    );
  });

  it('arrête un service quand on tue son processus principal', () => {
    const main = machine.services['apache2']?.mainPid;

    const killed = runLine(machine, `sudo kill -9 ${main}`).state;
    const termed = runLine(machine, `sudo kill ${main}`).state;

    expect(killed.services['apache2']?.state).toBe('failed');
    expect(killed.logs['apache2']?.at(-1)?.message).toBe(
      "apache2.service: Failed with result 'signal'.",
    );
    expect(termed.services['apache2']?.state).toBe('inactive');
  });

  it('suspend, relance, recharge et ignore le PID 1', () => {
    const pid = machine.processes.find((p) => p.command === 'yes')?.pid;
    expect(
      runLine(machine, `kill -STOP ${pid}`).state.processes.find((p) => p.pid === pid)?.stat,
    ).toBe('T');
    expect(
      runLine(machine, `kill -CONT ${pid}`).state.processes.find((p) => p.pid === pid)?.stat,
    ).toBe('S');
    expect(
      runLine(machine, `sudo kill -HUP ${machine.services['apache2']?.mainPid}`).state.services[
        'apache2'
      ]?.state,
    ).toBe('active');
    expect(runLine(machine, 'sudo kill 1').state.processes.some((p) => p.pid === 1)).toBe(true);
    expect(runLine(machine, `kill -USR1 ${pid}`).exitCode).toBe(0);
  });

  it("arrête tous les processus d'un nom", () => {
    expect(runLine(machine, 'killall yes').state.processes.some((p) => p.command === 'yes')).toBe(
      false,
    );
    expect(runLine(machine, 'killall python3').stderr).toBe(
      'python3(1500): Opération non permise\n',
    );
    expect(runLine(machine, 'killall inconnu').stderr).toBe('inconnu: aucun processus trouvé\n');
    expect(runLine(machine, 'killall -9 yes').exitCode).toBe(0);
    expect(runLine(machine, 'killall -BIDULE yes').exitCode).toBe(1);
    expect(runLine(machine, 'killall').exitCode).toBe(1);
  });
});

describe('tâches de fond', () => {
  const base = debianServer({});

  it('lance une commande en arrière-plan et la liste', () => {
    const result = runLines(base, ['sleep 300 &', 'jobs', 'jobs -l']);

    expect(runLine(base, 'sleep 300 &').stderr).toBe('[1] 2200\n');
    expect(result.stdout).toBe("[1]+  2200 En cours d'exécution    sleep 300 &\n");
    expect(result.state.processes.some((p) => p.command === 'sleep 300')).toBe(true);
    expect(runLines(base, ['sleep 300 &', 'yes &', 'jobs']).stdout).toBe(
      "[1]-  En cours d'exécution    sleep 300 &\n[2]+  En cours d'exécution    yes &\n",
    );
  });

  it('annonce une commande instantanée lancée en arrière-plan comme finie', () => {
    const result = runLine(base, 'echo bonjour &');

    expect(result.stdout).toBe('bonjour\n[1]+  Fini                    echo bonjour\n');
  });

  it("annonce la fin d'une tâche quand son délai est écoulé", () => {
    const started = runLine(base, 'sleep 5 &').state;

    const later = runLine(started, 'true', new Date(TEST_NOW.getTime() + 6000));

    expect(later.stdout).toBe('[1]+  Fini                    sleep 5 &\n');
    expect(later.state.session.jobs).toEqual([]);
  });

  it("ramène une tâche au premier plan, ou l'arrête", () => {
    expect(runLines(base, ['sleep 300 &', 'fg']).stdout).toBe('sleep 300\n');
    expect(runLines(base, ['tail -f /etc/hostname &', 'fg %1']).stdout).toBe(
      'tail -f /etc/hostname\n^C\n',
    );
    expect(runLines(base, ['sleep 300 &', 'bg']).stderr).toBe(
      'bash: bg: la tâche 1 est déjà en arrière-plan\n',
    );
    expect(runLine(base, 'fg').stderr).toBe('bash: fg: courant : tâche inexistante\n');
    expect(runLines(base, ['sleep 300 &', 'kill %1', 'jobs']).stdout).toBe('');
    expect(runLines(base, ['ping 1.1.1.1 &', 'jobs']).stdout).toContain('ping 1.1.1.1 &');
  });

  it('garde la sortie de nohup dans nohup.out', () => {
    const result = runLines(base, ['nohup echo fini &', 'cat nohup.out']);

    expect(runLine(base, 'nohup echo x').stderr).toBe(
      "nohup: les entrées sont ignorées et la sortie est ajoutée à 'nohup.out'\n",
    );
    expect(result.stdout).toBe('fini\n');
    expect(runLine(base, 'nohup').exitCode).toBe(125);
  });

  it('montre aussi les commandes du tube, comme le grep lui-même', () => {
    const out = runLine(machine, 'ps aux | grep "sshd"').stdout;
    expect(out).toMatch(/^hugo +\d+ +0\.0 +0\.1 +6332 +2304 pts\/0 +S\+ .* grep sshd$/m);
    expect(runLine(machine, 'ps').stdout).toMatch(/ ps$/m);
  });
});
