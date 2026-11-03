import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { memoryStats, uptimeText } from '@sims/shared/system';
import { freeHuman } from './system';
import { runLine, runLines } from '../test-utils';

const machine = debianServer({});

describe('free', () => {
  it('affiche la mémoire en Kio, en Mio et en format lisible', () => {
    const lines = runLine(machine, 'free').stdout.split('\n');
    expect(lines[0]).toBe(
      '               total     utilisé       libre     partagé  tamp/cache  disponible',
    );
    expect(lines[1]).toMatch(/^Mem: {4} +2008256 /);
    expect(lines[2]).toMatch(/^Échange: +998396 +0 +998396$/);
    expect(runLine(machine, 'free -h').stdout).toMatch(/^Mem: +1,9Gi /m);
    expect(runLine(machine, 'free -m').stdout).toMatch(/^Mem: +1961 /m);
    expect(runLine(machine, 'free -x').exitCode).toBe(1);
  });

  it('formate les tailles comme procps', () => {
    expect(freeHuman(0)).toBe('0B');
    expect(freeHuman(1_000)).toBe('1000Ki');
    expect(freeHuman(421_888)).toBe('412Mi');
    expect(freeHuman(2_008_256)).toBe('1,9Gi');
  });

  it("déborde sur l'échange quand un programme dévore la mémoire", () => {
    const greedy = {
      ...machine,
      processes: [...machine.processes, { ...machine.processes[0]!, pid: 9999, rss: 2_500_000 }],
    };
    expect(memoryStats(greedy).swapUsed).toBeGreaterThan(0);
  });
});

describe('uptime', () => {
  it("affiche l'heure, la durée, les sessions et la charge", () => {
    expect(runLine(machine, 'uptime').stdout).toMatch(
      /^ 09:31:44 up \d+ days?, +\d+:\d{2}, {2}1 user, {2}load average: \d,\d{2}, \d,\d{2}, \d,\d{2}\n$/,
    );
    expect(runLine(machine, 'uptime -p').stdout).toMatch(
      /^up \d+ days?, \d+ hours?, \d+ minutes?\n$/,
    );
    expect(runLine(machine, 'uptime -s').stdout).toMatch(/^2026-\d\d-\d\d \d\d:\d\d:\d\d\n$/);
    expect(runLine(machine, 'uptime -z').exitCode).toBe(1);
    expect(uptimeText({ days: 0, hours: 0, minutes: 14 })).toBe('up 14 min');
    expect(uptimeText({ days: 1, hours: 3, minutes: 5 })).toBe('up 1 day,  3:05');
  });
});

describe('nice et renice', () => {
  it('lance une commande en arrière-plan avec une priorité basse', () => {
    const state = runLine(machine, 'nice -n 15 sleep 300 &').state;
    const proc = state.processes.at(-1);
    expect(proc).toMatchObject({ command: 'sleep 300', nice: 15, stat: 'SN' });
    expect(runLine(state, 'top').stdout).toMatch(
      new RegExp(`^ *${proc?.pid ?? 0} hugo +35 +15 `, 'm'),
    );
    expect(runLine(machine, 'nice').stdout).toBe('0\n');
    expect(runLine(machine, 'nice -n 5 echo bonjour').stdout).toBe('bonjour\n');
    expect(runLine(machine, 'nice -n -5 echo bonjour').stderr).toContain(
      'nice: impossible de définir la priorité: Permission non accordée',
    );
    expect(runLine(machine, 'nice -n abc echo x').exitCode).toBe(125);
  });

  it('change la priorité de ses processus, et seulement root la remonte', () => {
    const started = runLine(machine, 'sleep 300 &').state;
    const pid = started.processes.at(-1)?.pid ?? 0;
    const lowered = runLine(started, `renice -n 10 -p ${pid}`);
    expect(lowered.stdout).toBe(`${pid} (process ID) old priority 0, new priority 10\n`);
    expect(lowered.state.processes.at(-1)?.stat).toBe('SN');
    expect(runLine(lowered.state, `renice -n 0 -p ${pid}`).stderr).toBe(
      `renice: failed to set priority for ${pid} (process ID): Permission non accordée\n`,
    );
    expect(runLine(lowered.state, `sudo renice -n -5 -p ${pid}`).state.processes.at(-1)?.nice).toBe(
      -5,
    );
    expect(runLine(machine, 'renice -n 5 -p 1').stderr).toContain('Permission non accordée');
    expect(runLine(machine, 'renice -n 5 -p 99999').stderr).toBe(
      'renice: failed to get priority for 99999 (process ID): Aucun processus de ce type\n',
    );
    expect(runLines(machine, ['sudo renice -n 5 -u www-data']).stderr).toBe(
      'renice: failed to get priority for 33 (user ID): Aucun processus de ce type\n',
    );
    expect(runLine(machine, 'sudo renice -n 5 -u fantome').stderr).toBe(
      'renice: unknown user fantome\n',
    );
    expect(runLine(machine, 'sudo renice -n 5 -u hugo').stdout).toBe(
      '1000 (user ID) old priority 0, new priority 5\n',
    );
    expect(runLine(machine, 'renice x').exitCode).toBe(1);
  });
});
