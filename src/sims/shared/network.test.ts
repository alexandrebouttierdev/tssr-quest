import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import {
  broadcastOf,
  hasInternet,
  hostAnswers,
  inSubnet,
  intToIp,
  ipToInt,
  linkLocalOf,
  maskToPrefix,
  nameservers,
  networkOf,
  parseCidr,
  resolveHost,
  routeTo,
} from './network';

const machine = debianServer({});

describe('adresses IPv4', () => {
  it('convertit, découpe et calcule réseau et diffusion', () => {
    expect(ipToInt('192.168.10.20')).toBe(3232238100);
    expect(intToIp(3232238100)).toBe('192.168.10.20');
    expect(ipToInt('192.168.10')).toBeNull();
    expect(ipToInt('192.168.10.300')).toBeNull();
    const cidr = parseCidr('192.168.10.20/24');
    expect(cidr).toEqual({ address: '192.168.10.20', prefix: 24 });
    expect(parseCidr('10.0.0.1/33')).toBeNull();
    expect(parseCidr('10.0.0.1')).toEqual({ address: '10.0.0.1', prefix: 32 });
    if (!cidr) return;
    expect(networkOf(cidr)).toBe('192.168.10.0');
    expect(broadcastOf(cidr)).toBe('192.168.10.255');
    expect(inSubnet('192.168.10.254', cidr)).toBe(true);
    expect(inSubnet('192.168.11.1', cidr)).toBe(false);
    expect(maskToPrefix('255.255.255.0')).toBe(24);
    expect(maskToPrefix('255.0.255.0')).toBeNull();
    expect(linkLocalOf('00:0c:29:61:a9:65')).toBe('fe80::20c:29ff:fe61:a965');
  });
});

describe('routage et voisins', () => {
  it('distingue la machine, le réseau local et la passerelle', () => {
    expect(routeTo(machine, '127.0.0.1').kind).toBe('local');
    expect(routeTo(machine, '192.168.10.20').kind).toBe('local');
    expect(routeTo(machine, '192.168.10.1')).toMatchObject({ kind: 'link', device: 'ens33' });
    expect(routeTo(machine, '8.8.8.8')).toMatchObject({
      kind: 'gateway',
      gateway: '192.168.10.254',
    });
    expect(hostAnswers(machine, '192.168.10.1')).toBe(true);
    expect(hostAnswers(machine, '192.168.10.77')).toBe(false);
    expect(hasInternet(machine)).toBe(true);
  });

  it("n'a plus de route sans passerelle ni interface active", () => {
    const noGateway = debianServer({}).routes.filter((r) => r.destination !== 'default');
    expect(routeTo({ ...machine, routes: noGateway }, '8.8.8.8').kind).toBe('unreachable');
    const down = { ...machine, interfaces: machine.interfaces.map((i) => ({ ...i, up: false })) };
    expect(hasInternet(down)).toBe(false);
  });
});

describe('résolution de noms', () => {
  it('lit /etc/hosts, puis le DNS de /etc/resolv.conf, avec les domaines de recherche', () => {
    expect(resolveHost(machine, 'localhost')).toMatchObject({ ok: true, address: '127.0.0.1' });
    expect(resolveHost(machine, 'srv-web01')).toMatchObject({ ok: true, address: '127.0.1.1' });
    expect(resolveHost(machine, 'deb.debian.org')).toMatchObject({ address: '151.101.130.132' });
    expect(resolveHost(machine, 'srv-dc01')).toEqual({
      ok: true,
      address: '192.168.10.1',
      name: 'srv-dc01.lab.local',
    });
    expect(resolveHost(machine, 'inconnu.example')).toEqual({ ok: false, reason: 'unknown' });
    expect(nameservers(machine)).toEqual(['192.168.10.1']);
  });

  it('échoue faute de serveur DNS joignable', () => {
    const broken = debianServer({
      files: { '/etc/resolv.conf': { content: 'nameserver 192.168.10.99\n' } },
    });
    expect(resolveHost(broken, 'deb.debian.org')).toEqual({ ok: false, reason: 'no-server' });
  });
});
