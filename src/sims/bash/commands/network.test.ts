import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine, runLines } from '../test-utils';

const machine = debianServer({ services: { apache2: { state: 'active' } } });

describe('ip', () => {
  it('affiche les adresses comme iproute2', () => {
    const out = runLine(machine, 'ip a').stdout;
    expect(out).toContain(
      '2: ens33: <BROADCAST,MULTICAST,UP,LOWER_UP> mtu 1500 qdisc fq_codel state UP group default qlen 1000',
    );
    expect(out).toContain('    inet 192.168.10.20/24 brd 192.168.10.255 scope global ens33\n');
    expect(out).toContain('    altname enp2s1\n');
    expect(runLine(machine, 'ip -br a').stdout).toMatch(/^ens33 {12}UP {13}192\.168\.10\.20\/24 /m);
    expect(runLine(machine, 'ip -4 a show ens33').stdout).not.toContain('inet6');
    expect(runLine(machine, 'ip a show eth0').stderr).toBe('Device "eth0" does not exist.\n');
    expect(runLine(machine, 'ip link').stdout).toContain('mode DEFAULT');
  });

  it('affiche la table de routage et les voisins', () => {
    expect(runLine(machine, 'ip route').stdout).toBe(
      'default via 192.168.10.254 dev ens33 onlink \n192.168.10.0/24 dev ens33 proto kernel scope link src 192.168.10.20 \n',
    );
    expect(runLine(machine, 'ip neigh').stdout).toContain('192.168.10.254 dev ens33 lladdr');
  });

  it('change adresses, liens et routes en root seulement', () => {
    expect(runLine(machine, 'ip link set ens33 down').stderr).toBe(
      'RTNETLINK answers: Opération non permise\n',
    );
    const reconfigured = runLines(machine, [
      'sudo ip addr flush dev ens33',
      'sudo ip addr add 192.168.20.5/24 dev ens33',
      'sudo ip route add default via 192.168.20.254',
    ]).state;
    expect(runLine(reconfigured, 'ip route').stdout).toBe(
      'default via 192.168.20.254 dev ens33 onlink \n192.168.20.0/24 dev ens33 proto kernel scope link src 192.168.20.5 \n',
    );
    expect(runLine(machine, 'sudo ip addr add 192.168.10.20/24 dev ens33').stderr).toBe(
      'RTNETLINK answers: Le fichier existe\n',
    );
    expect(runLine(machine, 'sudo ip route add default via 10.0.0.1').stderr).toBe(
      'Error: Nexthop has invalid gateway.\n',
    );
    expect(runLine(machine, 'sudo ip route add default via 192.168.10.1').stderr).toBe(
      'RTNETLINK answers: Le fichier existe\n',
    );
    expect(runLine(machine, 'sudo ip route del default').state.routes).toHaveLength(1);
    expect(runLine(machine, 'sudo ip route del 10.0.0.0/8').exitCode).toBe(2);
    expect(runLine(machine, 'sudo ip addr del 10.0.0.1/8 dev ens33').exitCode).toBe(2);
    expect(runLine(machine, 'sudo ip addr add 10.0.0.1/8').exitCode).toBe(1);
    expect(runLine(machine, 'ip bidule').stderr).toBe(
      'Object "bidule" is unknown, try "ip help".\n',
    );
    expect(runLine(machine, 'ip').exitCode).toBe(255);
  });

  it('coupe les routes quand le lien tombe, et rend la route locale quand il revient', () => {
    const down = runLine(machine, 'sudo ip link set ens33 down').state;
    expect(down.routes).toEqual([]);
    expect(runLine(down, 'ip -br a').stdout).toMatch(/^ens33 +DOWN/m);
    const up = runLine(down, 'sudo ip link set dev ens33 up').state;
    expect(up.routes.map((r) => r.destination)).toEqual(['192.168.10.0/24']);
  });
});

describe('ping', () => {
  it('reçoit les réponses de la passerelle et des hôtes publics', () => {
    const local = runLine(machine, 'ping -c 2 192.168.10.254');
    expect(local.exitCode).toBe(0);
    expect(local.stdout).toMatch(
      /^PING 192\.168\.10\.254 \(192\.168\.10\.254\) 56\(84\) octets de données\.\n/,
    );
    expect(local.stdout).toMatch(
      /64 octets de 192\.168\.10\.254 : icmp_seq=1 ttl=64 temps=0\.\d{3} ms/,
    );
    expect(local.stdout).toContain('2 paquets transmis, 2 reçus, 0 % paquets perdus');
    expect(runLine(machine, 'ping -c 1 deb.debian.org').stdout).toContain(
      '64 octets de deb.debian.org (151.101.130.132) : icmp_seq=1 ttl=56',
    );
    expect(runLine(machine, 'ping -c 1 srv-dc01').stdout).toContain('ttl=128');
  });

  it('simule Ctrl+C sans -c, et le mode silencieux', () => {
    expect(runLine(machine, 'ping 127.0.0.1').stdout).toContain('icmp_seq=4');
    expect(runLine(machine, 'ping 127.0.0.1').stdout).toContain('^C\n');
    expect(runLine(machine, 'ping -q -c 3 127.0.0.1').stdout).not.toContain('icmp_seq');
  });

  it('distingue hôte muet, réseau inaccessible et échec DNS', () => {
    const silent = runLine(machine, 'ping -c 2 192.168.10.77');
    expect(silent.exitCode).toBe(1);
    expect(silent.stdout).toContain(
      'Depuis 192.168.10.20 icmp_seq=1 Hôte de destination injoignable',
    );
    expect(silent.stdout).toContain(
      '2 paquets transmis, 0 reçus, +2 erreurs, 100 % paquets perdus',
    );
    const noRoute = runLine(machine, 'sudo ip route del default').state;
    expect(runLine(noRoute, 'ping 8.8.8.8').stderr).toBe(
      "ping: connect: Le réseau n'est pas accessible\n",
    );
    expect(runLine(machine, 'ping nulle-part.example').stderr).toBe(
      'ping: nulle-part.example: Nom ou service inconnu\n',
    );
    const noDns = debianServer({
      files: { '/etc/resolv.conf': { content: 'nameserver 192.168.10.99\n' } },
    });
    expect(runLine(noDns, 'ping deb.debian.org').stderr).toBe(
      'ping: deb.debian.org: Échec temporaire dans la résolution du nom\n',
    );
    expect(runLine(machine, 'ping').exitCode).toBe(1);
    expect(runLine(machine, 'ping -c 0 x').exitCode).toBe(1);
    expect(runLine(machine, 'ping -z x').exitCode).toBe(2);
  });
});

describe('ss', () => {
  it('liste les ports en écoute, avec les programmes en root', () => {
    const out = runLine(machine, 'sudo ss -tlnp').stdout;
    expect(out.split('\n')[0]).toBe(
      'State  Recv-Q Send-Q Local Address:Port Peer Address:PortProcess',
    );
    expect(out).toMatch(
      /LISTEN 0 {6}128 {10}0\.0\.0\.0:22 +0\.0\.0\.0:\* +users:\(\("sshd",pid=600,fd=3\)\)/,
    );
    expect(out).toContain('*:80');
    expect(runLine(machine, 'ss -tlnp').stdout).not.toContain('users:');
    expect(runLine(machine, 'ss -tl').stdout).toContain('0.0.0.0:ssh');
  });

  it('montre la session SSH établie, et rien en UDP', () => {
    expect(runLine(machine, 'ss').stdout).toContain('tcp   ESTAB  0      0      192.168.10.20:ssh');
    expect(runLine(machine, 'ss -ta').stdout).toContain('ESTAB');
    expect(runLine(machine, 'ss -uln').stdout.split('\n')).toHaveLength(2);
    expect(runLine(machine, 'ss -z').exitCode).toBe(1);
    expect(runLine(machine, 'ss bidule').exitCode).toBe(1);
  });
});

describe('ifup et ifdown', () => {
  it('désactive puis réactive une interface selon /etc/network/interfaces', () => {
    const down = runLine(machine, 'sudo ifdown ens33').state;
    expect(down.interfaces[1]).toMatchObject({ up: false, ipv4: null });
    expect(runLine(down, 'ping -c 1 8.8.8.8').stderr).toContain("Le réseau n'est pas accessible");
    expect(runLine(down, 'sudo ifdown ens33').stderr).toBe(
      'ifdown: interface ens33 not configured\n',
    );
    const up = runLine(down, 'sudo ifup ens33').state;
    expect(runLine(up, 'ip route').stdout).toContain('default via 192.168.10.254 dev ens33 onlink');
    expect(runLine(up, 'sudo ifup ens33').stderr).toBe(
      'ifup: interface ens33 already configured\n',
    );
  });

  it('applique une nouvelle adresse statique avec masque, et refuse une passerelle hors réseau', () => {
    const custom = (body: string) =>
      debianServer({
        files: {
          '/etc/network/interfaces': {
            content: `auto lo\niface lo inet loopback\n\nallow-hotplug ens33\niface ens33 inet static\n${body}`,
          },
        },
      });
    const fixed = runLines(
      custom('\taddress 192.168.10.42\n\tnetmask 255.255.255.0\n\tgateway 192.168.10.254\n'),
      ['sudo ifdown ens33', 'sudo ifup ens33'],
    ).state;
    expect(fixed.interfaces[1]?.ipv4).toBe('192.168.10.42/24');
    const wrong = runLines(custom('\taddress 192.168.10.42/24\n\tgateway 10.0.0.1\n'), [
      'sudo ifdown ens33',
      'sudo ifup ens33',
    ]);
    expect(wrong.stderr).toBe(
      'Error: Nexthop has invalid gateway.\nifup: failed to bring up ens33\n',
    );
    const missing = runLines(custom('\tgateway 192.168.10.254\n'), [
      'sudo ifdown ens33',
      'sudo ifup ens33',
    ]);
    expect(missing.stderr).toContain('ifup: missing required variable: address');
  });

  it('obtient un bail DHCP', () => {
    const dhcp = debianServer({
      files: {
        '/etc/network/interfaces': { content: 'allow-hotplug ens33\niface ens33 inet dhcp\n' },
      },
    });
    const result = runLines(dhcp, ['sudo ifdown ens33', 'sudo ifup ens33']);
    expect(result.stderr).toContain('DHCPACK of 192.168.10.105 from 192.168.10.254');
    expect(runLine(result.state, 'ip a').stdout).toContain('scope global dynamic ens33');
  });

  it('demande les droits root et connaît les interfaces déclarées', () => {
    expect(runLine(machine, '/usr/sbin/ifup ens33').stderr).toBe(
      'ifup: failed to open lockfile /run/network/.ifstate.lock: Permission denied\n',
    );
    expect(runLine(machine, 'sudo ifup eth9').stderr).toBe('ifup: unknown interface eth9\n');
    expect(runLine(machine, 'sudo ifup').stderr).toBe('ifup: no interface(s) specified\n');
    expect(runLine(machine, 'sudo ifup -a').stderr).toBe('ifup: interface lo already configured\n');
  });
});

describe('fichier interfaces selon la configuration de départ', () => {
  it('écrit inet dhcp, ou une adresse sans passerelle', () => {
    const dhcp = debianServer({ network: { dhcp: true } });
    expect(runLine(dhcp, 'tail -1 /etc/network/interfaces').stdout).toBe('iface ens33 inet dhcp\n');
    const bare = debianServer({ network: { noGateway: true } });
    expect(runLine(bare, 'cat /etc/network/interfaces').stdout).not.toContain('gateway');
  });
});
