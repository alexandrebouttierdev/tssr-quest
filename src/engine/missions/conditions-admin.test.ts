import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLines } from '@sims/bash/test-utils';
import type { Condition } from '@content/schemas';
import type { Machine } from '@sims/shared/types';
import { evaluateCondition } from './conditions';

const base = debianServer({ extraDisks: [{ name: 'sdb', size: '10G' }] });

/** Évalue une condition sur une machine unique. */
function check(machine: Machine, condition: Condition): boolean {
  return evaluateCondition(condition, { machines: { srv: machine }, defaultMachine: 'srv' });
}

/** Exécute des commandes et renvoie la machine obtenue. */
function after(lines: string[], machine: Machine = base): Machine {
  return runLines(machine, lines).state;
}

describe('conditions : comptes et groupes', () => {
  const created = after([
    'sudo groupadd compta',
    'sudo useradd -m -s /bin/bash -G compta julie.martin',
    'sudo chage -d 0 julie.martin',
  ]);

  it('vérifie un compte et ses groupes', () => {
    expect(check(base, { user: { name: 'julie.martin' } })).toBe(false);
    expect(check(base, { user: { name: 'julie.martin', exists: false } })).toBe(true);
    expect(
      check(created, {
        user: {
          name: 'julie.martin',
          groups: ['compta'],
          notGroups: ['sudo'],
          shell: '/bin/bash',
          home: '/home/julie.martin',
          primaryGroup: 'julie.martin',
          hasPassword: false,
          mustChangePassword: true,
        },
      }),
    ).toBe(true);
    expect(check(created, { user: { name: 'julie.martin', groups: ['sudo'] } })).toBe(false);
    expect(check(created, { user: { name: 'julie.martin', locked: true } })).toBe(false);
  });

  it('vérifie un groupe et ses membres', () => {
    expect(check(created, { group: { name: 'compta', members: ['julie.martin'] } })).toBe(true);
    expect(check(created, { group: { name: 'compta', members: ['hugo'] } })).toBe(false);
    expect(check(base, { group: { name: 'compta', exists: false } })).toBe(true);
    expect(check(base, { group: { name: 'compta' } })).toBe(false);
  });
});

describe('conditions : réseau', () => {
  it('vérifie l’adresse, la passerelle et le DNS en cours', () => {
    expect(
      check(base, {
        net: { iface: 'ens33', ip: '192.168.10.20/24', up: true, gateway: '192.168.10.254' },
      }),
    ).toBe(true);
    expect(check(base, { net: { ip: '192.168.10.30/24' } })).toBe(false);
    expect(check(base, { net: { gateway: '10.0.0.1' } })).toBe(false);
    expect(check(base, { net: { dns: '8.8.8.8' } })).toBe(false);
  });

  it('distingue une adresse posée avec ip d’une adresse écrite dans interfaces', () => {
    const live = after([
      'sudo ip addr flush dev ens33',
      'sudo ip addr add 192.168.10.30/24 dev ens33',
    ]);
    const goal: Condition = { net: { iface: 'ens33', ip: '192.168.10.30/24', persistent: true } };
    expect(check(live, { net: { iface: 'ens33', ip: '192.168.10.30/24' } })).toBe(true);
    expect(check(live, goal)).toBe(false);
    const node = live.fs['/etc/network/interfaces'];
    const text = node?.type === 'file' ? node.content : '';
    const written: Machine = {
      ...live,
      fs: {
        ...live.fs,
        '/etc/network/interfaces': {
          ...(node ?? { type: 'file', owner: 'root', group: 'root', mode: 0o644, mtime: 0 }),
          type: 'file',
          content: text.replace(
            /\taddress .*\n/,
            '\taddress 192.168.10.30\n\tnetmask 255.255.255.0\n',
          ),
        },
      },
    };
    expect(check(written, goal)).toBe(true);
  });
});

describe('conditions : planification', () => {
  it('trouve une tâche dans la table d’un compte ou dans /etc/cron.d', () => {
    const own = after([
      '(crontab -l; echo "30 2 * * 1-5 /usr/local/bin/sauvegarde.sh") | crontab -',
    ]);
    expect(
      check(own, {
        cron: { user: 'hugo', matches: 'sauvegarde\\.sh$', schedule: '30  2 * * 1-5' },
      }),
    ).toBe(true);
    expect(
      check(own, { cron: { user: 'hugo', matches: 'sauvegarde', schedule: '0 2 * * *' } }),
    ).toBe(false);
    expect(check(own, { cron: { matches: 'sauvegarde' } })).toBe(false);
    const system = after([
      'echo "0 3 * * * root /usr/sbin/logrotate /etc/logrotate.conf" | sudo tee /etc/cron.d/rotation',
    ]);
    expect(check(system, { cron: { matches: 'logrotate', schedule: '0 3 * * *' } })).toBe(true);
  });

  it('trouve un travail programmé par at', () => {
    // at n'est pas installé par défaut sur Debian.
    const withAt = debianServer({ packages: { install: ['at'] } });
    const job = after(['echo "systemctl restart apache2" | at 23:00'], withAt);
    expect(check(job, { at: { matches: 'restart apache2', user: 'hugo' } })).toBe(true);
    expect(check(job, { at: { matches: 'reboot' } })).toBe(false);
  });
});

describe('conditions : disques et LVM', () => {
  const lvm = after([
    'sudo pvcreate /dev/sdb',
    'sudo vgcreate vg_data /dev/sdb',
    'sudo lvcreate -L 5G -n lv_partage vg_data',
    'sudo mkfs.ext4 /dev/vg_data/lv_partage',
    'sudo mkdir /srv/partage',
    'sudo mount /dev/vg_data/lv_partage /srv/partage',
  ]);

  it('vérifie le groupe et le volume logique', () => {
    expect(
      check(lvm, { lvm: { vg: 'vg_data', pvs: ['/dev/sdb'], lv: 'lv_partage', minSize: '5G' } }),
    ).toBe(true);
    expect(check(lvm, { lvm: { vg: 'vg_data', lv: 'lv_partage', minSize: '8G' } })).toBe(false);
    expect(check(lvm, { lvm: { vg: 'vg_data', minSize: '9G' } })).toBe(true);
    expect(check(base, { lvm: { vg: 'vg_data' } })).toBe(false);
  });

  it('vérifie le montage, le périphérique et la déclaration dans fstab', () => {
    const mounted: Condition = {
      disk: {
        mount: '/srv/partage',
        device: '/dev/vg_data/lv_partage',
        fstype: 'ext4',
        minSize: '5G',
      },
    };
    expect(check(lvm, mounted)).toBe(true);
    expect(check(base, mounted)).toBe(false);
    expect(check(base, { disk: { mount: '/srv/partage', mounted: false } })).toBe(true);
    expect(check(lvm, { disk: { mount: '/srv/partage', persistent: true } })).toBe(false);
    expect(check(lvm, { disk: { mount: '/srv/partage', persistent: false } })).toBe(true);
    const fstab = after(
      [
        'echo "/dev/mapper/vg_data-lv_partage /srv/partage ext4 defaults 0 2" | sudo tee -a /etc/fstab',
      ],
      lvm,
    );
    expect(check(fstab, { disk: { mount: '/srv/partage', persistent: true } })).toBe(true);
  });
});

describe('conditions : liens symboliques', () => {
  it('vérifie la cible d’un lien, relative ou absolue', () => {
    const linked = after([
      'mkdir docs',
      'touch docs/rapport.txt',
      'ln -s docs/rapport.txt dernier',
    ]);
    expect(
      check(linked, { file: { path: '/home/hugo/dernier', linkTo: 'docs/rapport.txt' } }),
    ).toBe(true);
    expect(
      check(linked, {
        file: { path: '/home/hugo/dernier', linkTo: '/home/hugo/docs/rapport.txt' },
      }),
    ).toBe(true);
    expect(check(linked, { file: { path: '/home/hugo/docs', linkTo: '/tmp' } })).toBe(false);
    expect(check(linked, { file: { path: '/home/hugo/dernier', linkTo: '/tmp' } })).toBe(false);
  });
});

describe('conditions : paquets et processus', () => {
  it('vérifie un paquet installé ou retiré', () => {
    expect(check(base, { package: { name: 'curl' } })).toBe(true);
    expect(check(base, { package: { name: 'apache2' } })).toBe(false);
    expect(check(base, { package: { name: 'apache2', installed: false } })).toBe(true);
    expect(check(base, { package: { name: 'curl', upToDate: true } })).toBe(true);
    const late = debianServer({
      packages: { updates: { curl: { version: '7.88.1-10+deb12u12' } } },
    });
    expect(check(late, { package: { name: 'curl', upToDate: true } })).toBe(false);
  });

  it('vérifie un processus, son propriétaire et sa priorité', () => {
    const busy = debianServer({
      processes: [{ user: 'julie', command: '/usr/bin/python3 calcul.py', cpu: 98 }],
    });
    expect(check(busy, { process: { matches: 'calcul\\.py', user: 'julie' } })).toBe(true);
    expect(check(busy, { process: { matches: 'calcul\\.py', running: false } })).toBe(false);
    expect(check(busy, { process: { matches: 'calcul\\.py', niceAtLeast: 10 } })).toBe(false);
    const pid = busy.processes.find((p) => p.command.includes('calcul'))?.pid ?? 0;
    const slowed = after([`sudo renice -n 15 -p ${pid}`], busy);
    expect(check(slowed, { process: { matches: 'calcul\\.py', niceAtLeast: 10 } })).toBe(true);
    const killed = after([`sudo kill ${pid}`], busy);
    expect(check(killed, { process: { matches: 'calcul\\.py', running: false } })).toBe(true);
  });
});
