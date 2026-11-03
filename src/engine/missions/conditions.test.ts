import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine } from '@sims/bash/test-utils';
import { evaluateCondition } from './conditions';

const base = debianServer({
  disks: [{ mount: '/var', size: '20G', used: '20G' }],
  files: {
    '/var/log/debug.log': { size: '18G' },
    '/etc/app.conf': { content: 'port=80\n', mode: '0640', owner: 'hugo', group: 'adm' },
  },
  services: { apache2: { state: 'failed', failure: 'no-space-left' } },
});
const machines = { srv: base };

describe('conditions de réussite', () => {
  it("vérifie une commande réussie dans l'historique", () => {
    const after = runLine(base, 'systemctl status apache2').state;
    const failed = runLine(base, 'systemctl restart apache2').state;
    const cond = { command: { matches: 'systemctl (status|restart) apache2' } };

    expect(evaluateCondition(cond, { machines, defaultMachine: 'srv' })).toBe(false);
    expect(evaluateCondition(cond, { machines: { srv: after }, defaultMachine: 'srv' })).toBe(true);
    expect(evaluateCondition(cond, { machines: { srv: failed }, defaultMachine: 'srv' })).toBe(
      false,
    );
  });

  it("vérifie l'état d'un service", () => {
    const world = { machines, defaultMachine: 'srv' };

    expect(evaluateCondition({ service: { name: 'apache2', state: 'failed' } }, world)).toBe(true);
    expect(evaluateCondition({ service: { name: 'apache2', state: 'active' } }, world)).toBe(false);
    expect(evaluateCondition({ service: { name: 'apache2', enabled: true } }, world)).toBe(true);
    expect(evaluateCondition({ service: { name: 'absent' } }, world)).toBe(false);
  });

  it("vérifie l'occupation d'un disque", () => {
    const freed = runLine(base, 'sudo rm /var/log/debug.log').state;

    expect(
      evaluateCondition(
        { disk: { mount: '/var', usageBelow: 80 } },
        { machines, defaultMachine: 'srv' },
      ),
    ).toBe(false);
    expect(
      evaluateCondition(
        { disk: { mount: '/var', usageBelow: 80 } },
        { machines: { srv: freed }, defaultMachine: 'srv' },
      ),
    ).toBe(true);
    expect(
      evaluateCondition(
        { disk: { mount: '/nulle', usageBelow: 80 } },
        { machines, defaultMachine: 'srv' },
      ),
    ).toBe(false);
  });

  it('vérifie un fichier : existence, contenu, motif, droits, propriétaire', () => {
    const world = { machines, defaultMachine: 'srv' };

    expect(evaluateCondition({ file: { path: '/etc/app.conf' } }, world)).toBe(true);
    expect(evaluateCondition({ file: { path: '/etc/absent', exists: false } }, world)).toBe(true);
    expect(evaluateCondition({ file: { path: '/etc/absent' } }, world)).toBe(false);
    expect(evaluateCondition({ file: { path: '/etc/app.conf', exists: false } }, world)).toBe(
      false,
    );
    expect(evaluateCondition({ file: { path: '/etc/app.conf', contains: 'port=80' } }, world)).toBe(
      true,
    );
    expect(
      evaluateCondition({ file: { path: '/etc/app.conf', matches: '^port=\\d+$' } }, world),
    ).toBe(true);
    expect(
      evaluateCondition(
        { file: { path: '/etc/app.conf', mode: '0640', owner: 'hugo', group: 'adm' } },
        world,
      ),
    ).toBe(true);
    expect(evaluateCondition({ file: { path: '/etc/app.conf', mode: '640' } }, world)).toBe(true);
    expect(evaluateCondition({ file: { path: '/etc/app.conf', mode: '0644' } }, world)).toBe(false);
    expect(evaluateCondition({ file: { path: '/etc', contains: 'x' } }, world)).toBe(false);
  });

  it('combine avec all, any et not', () => {
    const world = { machines, defaultMachine: 'srv' };
    const t = { service: { name: 'apache2', state: 'failed' as const } };
    const f = { service: { name: 'apache2', state: 'active' as const } };

    expect(evaluateCondition({ all: [t, t] }, world)).toBe(true);
    expect(evaluateCondition({ all: [t, f] }, world)).toBe(false);
    expect(evaluateCondition({ any: [f, t] }, world)).toBe(true);
    expect(evaluateCondition({ not: f }, world)).toBe(true);
  });

  it('vise une autre machine, et échoue si elle est inconnue', () => {
    const world = {
      machines: { srv: base, autre: debianServer({ hostname: 'autre' }) },
      defaultMachine: 'srv',
    };

    expect(
      evaluateCondition({ service: { name: 'ssh', state: 'active', machine: 'autre' } }, world),
    ).toBe(true);
    expect(evaluateCondition({ service: { name: 'ssh', machine: 'fantome' } }, world)).toBe(false);
  });
});
