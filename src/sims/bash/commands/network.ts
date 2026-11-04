import {
  broadcastOf,
  hostAnswers,
  inSubnet,
  ipToInt,
  isIpv4,
  linkLocalOf,
  maskToPrefix,
  neighborsOf,
  networkOf,
  parseCidr,
  resolveHost,
  routeTo,
  type Cidr,
  readInterfaces,
  type IfaceStanza,
} from '@sims/shared/network';
import { SERVICE_CATALOG } from '@sims/shared/service-catalog';
import type { Machine, NetInterface, Route } from '@sims/shared/types';
import type { BashCommand, CommandEnv, CommandOutcome } from '../command';

// --- Aides -----------------------------------------------------------------------------

/** Remplace une interface de la machine. */
function withInterface(machine: Machine, name: string, change: Partial<NetInterface>): Machine {
  return {
    ...machine,
    interfaces: machine.interfaces.map((i) => (i.name === name ? { ...i, ...change } : i)),
  };
}

/** Route du noyau vers le réseau local d'une adresse. */
function kernelRoute(device: string, cidr: Cidr): Route {
  return { destination: `${networkOf(cidr)}/${cidr.prefix}`, gateway: null, device };
}

/** Retire les routes qui passent par une interface. */
function withoutRoutesOf(machine: Machine, device: string): Machine {
  return { ...machine, routes: machine.routes.filter((r) => r.device !== device) };
}

/** Message d'iproute2 quand l'opération demande les droits root. */
const RTNETLINK_EPERM = 'RTNETLINK answers: Opération non permise\n';

/** Interface par son nom, ou message d'erreur d'iproute2. */
function findDevice(machine: Machine, name: string | undefined): NetInterface | string {
  const iface = machine.interfaces.find((i) => i.name === name);
  return iface ?? `Cannot find device "${name ?? ''}"\n`;
}

// --- ip --------------------------------------------------------------------------------

/** Drapeaux et état d'une interface, comme `ip link`. */
function linkFlags(i: NetInterface): { flags: string; state: string; qdisc: string } {
  if (i.name === 'lo')
    return {
      flags: i.up ? '<LOOPBACK,UP,LOWER_UP>' : '<LOOPBACK>',
      state: i.up ? 'UNKNOWN' : 'DOWN',
      qdisc: 'noqueue',
    };
  return {
    flags: i.up ? '<BROADCAST,MULTICAST,UP,LOWER_UP>' : '<BROADCAST,MULTICAST>',
    state: i.up ? 'UP' : 'DOWN',
    qdisc: 'fq_codel',
  };
}

/** Ligne d'en-tête et adresse matérielle d'une interface. */
function linkLines(i: NetInterface, index: number, mode: boolean): string {
  const { flags, state, qdisc } = linkFlags(i);
  const kind =
    i.name === 'lo'
      ? '    link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00\n'
      : `    link/ether ${i.mac} brd ff:ff:ff:ff:ff:ff\n`;
  // Les cartes VMware nommées ens33 portent aussi leur nom « chemin PCI ».
  const alt = /^ens3\d$/.test(i.name) ? `    altname enp2s${Number(i.name.slice(3)) - 32}\n` : '';
  return `${index}: ${i.name}: ${flags} mtu ${i.mtu} qdisc ${qdisc} state ${state}${mode ? ' mode DEFAULT' : ''} group default qlen 1000\n${kind}${alt}`;
}

/** Lignes `inet` / `inet6` d'une interface. */
function addressLines(i: NetInterface, family: '4' | '6' | 'all'): string {
  let out = '';
  const lft = i.dhcp
    ? 'valid_lft 1726sec preferred_lft 1726sec'
    : 'valid_lft forever preferred_lft forever';
  if (family !== '6' && i.ipv4) {
    const cidr = parseCidr(i.ipv4);
    if (i.name === 'lo') out += `    inet ${i.ipv4} scope host lo\n       ${lft}\n`;
    else if (cidr)
      out += `    inet ${i.ipv4} brd ${broadcastOf(cidr)} scope global ${i.dhcp ? 'dynamic ' : ''}${i.name}\n       ${lft}\n`;
  }
  if (family !== '4' && i.up) {
    out +=
      i.name === 'lo'
        ? '    inet6 ::1/128 scope host noprefixroute \n       valid_lft forever preferred_lft forever\n'
        : `    inet6 ${linkLocalOf(i.mac)}/64 scope link \n       valid_lft forever preferred_lft forever\n`;
  }
  return out;
}

/** `ip -br address` : une ligne par interface. */
function briefLine(i: NetInterface, withAddresses: boolean): string {
  const { state } = linkFlags(i);
  const addresses = withAddresses
    ? [i.ipv4, i.up ? (i.name === 'lo' ? '::1/128' : `${linkLocalOf(i.mac)}/64`) : null]
        .filter(Boolean)
        .join(' ')
    : i.name === 'lo'
      ? '00:00:00:00:00:00 <LOOPBACK,UP,LOWER_UP>'
      : `${i.mac} ${linkFlags(i).flags}`;
  return `${i.name.padEnd(16)} ${state.padEnd(14)} ${addresses} \n`;
}

/** Une route au format de `ip route`. */
function routeLine(machine: Machine, r: Route): string {
  if (r.destination === 'default')
    return `default via ${r.gateway ?? ''} dev ${r.device} onlink \n`;
  if (r.gateway) return `${r.destination} via ${r.gateway} dev ${r.device} \n`;
  const iface = machine.interfaces.find((i) => i.name === r.device);
  const src = iface?.ipv4?.split('/')[0];
  return `${r.destination} dev ${r.device} proto kernel scope link${src ? ` src ${src}` : ''} \n`;
}

/** Sous-commandes d'`ip address`. */
function ipAddress(
  env: CommandEnv,
  words: string[],
  family: '4' | '6' | 'all',
  brief: boolean,
): CommandOutcome {
  const [action = 'show', ...rest] = words;
  const machine = env.machine;
  const devIndex = rest.indexOf('dev');
  const devName = devIndex >= 0 ? rest[devIndex + 1] : undefined;
  if (['show', 'list', 'ls', 'sh', 's'].includes(action)) {
    const name = devName ?? rest.find((w) => w !== 'dev');
    const ifaces = name ? machine.interfaces.filter((i) => i.name === name) : machine.interfaces;
    if (name && ifaces.length === 0)
      return { stderr: `Device "${name}" does not exist.\n`, exitCode: 1 };
    const out = ifaces
      .map((i) =>
        brief
          ? briefLine(i, true)
          : linkLines(i, machine.interfaces.indexOf(i) + 1, false) + addressLines(i, family),
      )
      .join('');
    return { stdout: out, exitCode: 0 };
  }
  if (env.user !== 'root') return { stderr: RTNETLINK_EPERM, exitCode: 2 };
  if (action === 'flush') {
    const found = findDevice(machine, devName ?? rest[0]);
    if (typeof found === 'string') return { stderr: found, exitCode: 1 };
    return {
      machine: withoutRoutesOf(
        withInterface(machine, found.name, { ipv4: null, dhcp: false }),
        found.name,
      ),
      exitCode: 0,
    };
  }
  if (action === 'add' || action === 'del' || action === 'delete') {
    const cidr = parseCidr(rest[0] ?? '');
    if (!cidr)
      return {
        stderr: `Error: any valid prefix is expected rather than "${rest[0] ?? ''}".\n`,
        exitCode: 1,
      };
    const found = findDevice(machine, devName);
    if (typeof found === 'string')
      return {
        stderr: devName ? found : 'Not enough information: "dev" argument is required.\n',
        exitCode: 1,
      };
    const text = `${cidr.address}/${cidr.prefix}`;
    if (action === 'add') {
      if (found.ipv4 === text)
        return { stderr: 'RTNETLINK answers: Le fichier existe\n', exitCode: 2 };
      let next = withInterface(machine, found.name, { ipv4: text, dhcp: false });
      if (found.up) {
        next = {
          ...next,
          routes: [
            ...next.routes.filter(
              (r) => r.device !== found.name || r.gateway !== null || r.destination === 'default',
            ),
            kernelRoute(found.name, cidr),
          ],
        };
      }
      return { machine: next, exitCode: 0 };
    }
    if (found.ipv4?.split('/')[0] !== cidr.address)
      return { stderr: "RTNETLINK answers: Ne peut attribuer l'adresse demandée\n", exitCode: 2 };
    return {
      machine: withoutRoutesOf(
        withInterface(machine, found.name, { ipv4: null, dhcp: false }),
        found.name,
      ),
      exitCode: 0,
    };
  }
  return { stderr: `Command "${action}" is unknown, try "ip address help".\n`, exitCode: 1 };
}

/** Sous-commandes d'`ip link`. */
function ipLink(env: CommandEnv, words: string[], brief: boolean): CommandOutcome {
  const [action = 'show', ...rest] = words;
  const machine = env.machine;
  if (['show', 'list', 'ls', 'sh'].includes(action)) {
    const name = rest.filter((w) => w !== 'dev')[0];
    const ifaces = name ? machine.interfaces.filter((i) => i.name === name) : machine.interfaces;
    if (name && ifaces.length === 0)
      return { stderr: `Device "${name}" does not exist.\n`, exitCode: 1 };
    return {
      stdout: ifaces
        .map((i) =>
          brief ? briefLine(i, false) : linkLines(i, machine.interfaces.indexOf(i) + 1, true),
        )
        .join(''),
      exitCode: 0,
    };
  }
  if (action !== 'set')
    return { stderr: `Command "${action}" is unknown, try "ip link help".\n`, exitCode: 1 };
  const words2 = rest.filter((w) => w !== 'dev');
  const found = findDevice(machine, words2[0]);
  if (typeof found === 'string') return { stderr: found, exitCode: 1 };
  const state = words2[1];
  if (state !== 'up' && state !== 'down')
    return { stderr: `Error: argument "${state ?? ''}" is wrong: unknown command\n`, exitCode: 1 };
  if (env.user !== 'root') return { stderr: RTNETLINK_EPERM, exitCode: 2 };
  if (state === 'down') {
    // Le noyau retire les routes de l'interface quand le lien tombe.
    return {
      machine: withoutRoutesOf(withInterface(machine, found.name, { up: false }), found.name),
      exitCode: 0,
    };
  }
  let next = withInterface(machine, found.name, { up: true });
  const cidr = found.ipv4 ? parseCidr(found.ipv4) : null;
  if (
    cidr &&
    found.name !== 'lo' &&
    !next.routes.some((r) => r.device === found.name && r.gateway === null)
  )
    next = { ...next, routes: [...next.routes, kernelRoute(found.name, cidr)] };
  return { machine: next, exitCode: 0 };
}

/** Sous-commandes d'`ip route`. */
function ipRoute(env: CommandEnv, words: string[]): CommandOutcome {
  const [action = 'show', ...rest] = words;
  const machine = env.machine;
  if (['show', 'list', 'ls', 'sh'].includes(action)) {
    const ordered = [...machine.routes].sort((a, b) =>
      a.destination === 'default' ? -1 : b.destination === 'default' ? 1 : 0,
    );
    return { stdout: ordered.map((r) => routeLine(machine, r)).join(''), exitCode: 0 };
  }
  if (action !== 'add' && action !== 'del' && action !== 'delete' && action !== 'replace')
    return { stderr: `Command "${action}" is unknown, try "ip route help".\n`, exitCode: 1 };
  if (env.user !== 'root') return { stderr: RTNETLINK_EPERM, exitCode: 2 };
  const destination = rest[0] === '0.0.0.0/0' ? 'default' : (rest[0] ?? '');
  const via = rest[rest.indexOf('via') + 1];
  const hasVia = rest.includes('via');
  if (action === 'del' || action === 'delete') {
    const exists = machine.routes.some(
      (r) => r.destination === destination && (!hasVia || r.gateway === via),
    );
    if (!exists) return { stderr: 'RTNETLINK answers: Aucun processus de ce type\n', exitCode: 2 };
    return {
      machine: {
        ...machine,
        routes: machine.routes.filter(
          (r) => !(r.destination === destination && (!hasVia || r.gateway === via)),
        ),
      },
      exitCode: 0,
    };
  }
  if (!hasVia || !via || !isIpv4(via))
    return { stderr: 'Error: either "to" is duplicate, or "via" is a garbage.\n', exitCode: 1 };
  if (destination !== 'default' && !parseCidr(destination))
    return {
      stderr: `Error: inet prefix is expected rather than "${destination}".\n`,
      exitCode: 1,
    };
  // La passerelle doit être sur un réseau directement relié.
  const link = machine.interfaces.find((i) => {
    const cidr = i.up && i.ipv4 ? parseCidr(i.ipv4) : null;
    return cidr !== null && i.name !== 'lo' && inSubnet(via, cidr);
  });
  if (!link) return { stderr: 'Error: Nexthop has invalid gateway.\n', exitCode: 2 };
  const exists = machine.routes.some((r) => r.destination === destination);
  if (exists && action === 'add')
    return { stderr: 'RTNETLINK answers: Le fichier existe\n', exitCode: 2 };
  const kept = machine.routes.filter((r) => r.destination !== destination);
  return {
    machine: { ...machine, routes: [...kept, { destination, gateway: via, device: link.name }] },
    exitCode: 0,
  };
}

/** `ip neigh` : la table ARP. */
function ipNeigh(env: CommandEnv): CommandOutcome {
  const machine = env.machine;
  const lines = neighborsOf(machine)
    .map((n) => {
      const route = routeTo(machine, n.address);
      return route.kind === 'link'
        ? `${n.address} dev ${route.device} lladdr ${n.mac} STALE \n`
        : '';
    })
    .join('');
  return { stdout: lines, exitCode: 0 };
}

/** Commande `ip` (iproute2) : adresses, liens, routes, voisins. */
export const ip: BashCommand = {
  name: 'ip',
  summary: 'affiche et modifie la configuration réseau (adresses, liens, routes)',
  package: 'iproute2',
  manual: `NOM
       ip - afficher et modifier les adresses, les interfaces et les routes

SYNOPSIS
       ip [OPTIONS] OBJET { COMMANDE }

DESCRIPTION
       Les modifications prennent effet tout de suite mais ne survivent pas à un
       redémarrage : la configuration durable est dans /etc/network/interfaces.

       ip a                                adresses de toutes les interfaces
       ip -br a                            résumé, une ligne par interface
       ip addr add 192.168.10.30/24 dev ens33
       ip addr flush dev ens33             retirer toutes les adresses
       ip link set ens33 down              désactiver une interface (up : l'activer)
       ip route                            table de routage
       ip route add default via 192.168.10.254
       ip neigh                            voisins connus (table ARP)

       -4 / -6   seulement IPv4 / IPv6       -br   affichage résumé`,
  run(args, env) {
    let family: '4' | '6' | 'all' = 'all';
    let brief = false;
    const words: string[] = [];
    for (const arg of args) {
      if (arg === '-4') family = '4';
      else if (arg === '-6') family = '6';
      else if (arg === '-br' || arg === '-brief' || arg === '--brief') brief = true;
      else if (arg === '-c' || arg === '-color' || arg === '-s') continue;
      else words.push(arg);
    }
    const [object, ...rest] = words;
    if (object === undefined)
      return {
        stderr:
          'Usage: ip [ OPTIONS ] OBJECT { COMMAND | help }\nwhere  OBJECT := { address | link | neighbour | route | ... }\n',
        exitCode: 255,
      };
    const is = (full: string) => object.length > 0 && full.startsWith(object);
    if (is('address') || object === 'a') return ipAddress(env, rest, family, brief);
    if (is('link')) return ipLink(env, rest, brief);
    if (is('route') || object === 'r') return ipRoute(env, rest);
    if (is('neighbour') || is('neighbor')) return ipNeigh(env);
    return { stderr: `Object "${object}" is unknown, try "ip help".\n`, exitCode: 1 };
  },
};

// --- ping ------------------------------------------------------------------------------

/** TTL de la réponse selon l'hôte (Windows : 128, Linux et routeurs : 64, Internet : moins). */
function replyTtl(machine: Machine, address: string): number {
  const route = routeTo(machine, address);
  if (route.kind === 'gateway') return address === '8.8.8.8' || address === '8.8.4.4' ? 117 : 56;
  const neighbor = neighborsOf(machine).find((n) => n.address === address);
  return neighbor?.name?.startsWith('srv-dc') ? 128 : 64;
}

/** Commande `ping` : teste la joignabilité d'un hôte (ICMP). */
export const ping: BashCommand = {
  name: 'ping',
  summary: 'teste si une machine répond sur le réseau',
  package: 'iputils-ping',
  manual: `NOM
       ping - envoyer des requêtes ICMP ECHO à une machine

SYNOPSIS
       ping [-c NOMBRE] HÔTE

DESCRIPTION
       Envoie des paquets à HÔTE et affiche les réponses et le temps
       d'aller-retour. Sans -c, ping tourne jusqu'à Ctrl+C (ici, 4 paquets).
       Démarche de diagnostic : sa propre adresse, la passerelle, une adresse
       publique (8.8.8.8), puis un nom (deb.debian.org) pour tester le DNS.

       -c N   envoyer N paquets puis s'arrêter
       -q     n'afficher que le résumé`,
  run(args, env) {
    let count: number | null = null;
    let quiet = false;
    let target: string | undefined;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i] ?? '';
      if (arg === '-c') count = Number(args[++i]);
      else if (/^-c\d+$/.test(arg)) count = Number(arg.slice(2));
      else if (arg === '-q') quiet = true;
      else if (arg === '-4' || arg === '-n') continue;
      else if (arg === '-W' || arg === '-i' || arg === '-s' || arg === '-w') i++;
      else if (arg.startsWith('-'))
        return { stderr: `ping: invalid option -- '${arg.slice(1)}'\n`, exitCode: 2 };
      else target = arg;
    }
    if (count !== null && (!Number.isInteger(count) || count < 1))
      return {
        stderr: `ping: invalid argument: '${String(count)}': out of range: 1 <= value <= 9223372036854775807\n`,
        exitCode: 1,
      };
    if (!target)
      return { stderr: 'ping: usage error: Destination address required\n', exitCode: 1 };
    const machine = env.machine;
    const resolved = resolveHost(machine, target);
    if (!resolved.ok) {
      const reason =
        resolved.reason === 'no-server'
          ? 'Échec temporaire dans la résolution du nom'
          : 'Nom ou service inconnu';
      return { stderr: `ping: ${target}: ${reason}\n`, exitCode: 2 };
    }
    const address = resolved.address;
    const route = routeTo(machine, address);
    if (route.kind === 'unreachable')
      return { stderr: "ping: connect: Le réseau n'est pas accessible\n", exitCode: 2 };
    const sent = count ?? 4;
    const answers = hostAnswers(machine, address);
    const rng = env.ctx.rng;
    const base = route.kind === 'local' ? 0.03 : route.kind === 'link' ? 0.4 : 12;
    const shown = isIpv4(target) ? address : `${resolved.name} (${address})`;
    let stdout = `PING ${isIpv4(target) ? address : resolved.name} (${address}) 56(84) octets de données.\n`;
    const times: number[] = [];
    for (let seq = 1; seq <= sent; seq++) {
      if (answers) {
        const t = base * (0.8 + rng.next() * 0.5);
        times.push(t);
        if (!quiet)
          stdout += `64 octets de ${shown} : icmp_seq=${seq} ttl=${replyTtl(machine, address)} temps=${t < 1 ? t.toFixed(3) : t.toFixed(1)} ms\n`;
      } else if (!quiet && route.kind === 'link') {
        stdout += `Depuis ${route.source} icmp_seq=${seq} Hôte de destination injoignable\n`;
      }
    }
    if (count === null) stdout += '^C\n';
    const elapsed = (sent - 1) * 1000 + Math.round(rng.next() * 8) + 2;
    const lost = Math.round(((sent - times.length) / sent) * 100);
    stdout += `\n--- statistiques ping ${isIpv4(target) ? address : resolved.name} ---\n`;
    if (times.length > 0) {
      const min = Math.min(...times);
      const max = Math.max(...times);
      const avg = times.reduce((s, t) => s + t, 0) / times.length;
      const mdev = Math.sqrt(times.reduce((s, t) => s + (t - avg) ** 2, 0) / times.length);
      stdout += `${sent} paquets transmis, ${times.length} reçus, ${lost} % paquets perdus, temps ${elapsed} ms\nrtt min/moy/max/mdev = ${[min, avg, max, mdev].map((v) => v.toFixed(3)).join('/')} ms\n`;
      return { stdout, exitCode: 0 };
    }
    const errors = route.kind === 'link' ? `, +${sent} erreurs` : '';
    stdout += `${sent} paquets transmis, 0 reçus${errors}, 100 % paquets perdus, temps ${elapsed} ms\n`;
    // Un hôte qui ne répond pas n'est pas une erreur de commande : la commande a bien tourné.
    return { stdout, exitCode: 1, ok: true };
  },
};

// --- ss --------------------------------------------------------------------------------

/** Socket en écoute ou établie. */
interface SocketRow {
  readonly state: 'LISTEN' | 'ESTAB';
  readonly recvQ: number;
  readonly sendQ: number;
  readonly local: readonly [string, number];
  readonly peer: readonly [string, string];
  readonly process: string;
}

/** Nom de service des ports courants (/etc/services). */
const PORT_NAMES: Readonly<Record<number, string>> = {
  22: 'ssh',
  80: 'http',
  443: 'https',
  3306: 'mysql',
};

/** Sockets TCP de la machine, d'après ses services actifs et la session SSH. */
function tcpSockets(machine: Machine): SocketRow[] {
  const rows: SocketRow[] = [];
  const v6: SocketRow[] = [];
  for (const service of Object.values(machine.services)) {
    if (service.state !== 'active' || service.mainPid === null) continue;
    const def = SERVICE_CATALOG[service.name];
    const pids = (def?.processes ?? []).map((_, i) => (service.mainPid ?? 0) + i);
    const proc = (name: string, fd: number, list = [service.mainPid ?? 0]) =>
      `users:(${list.map((pid) => `("${name}",pid=${pid},fd=${fd})`).join(',')})`;
    if (service.name === 'ssh') {
      rows.push({
        state: 'LISTEN',
        recvQ: 0,
        sendQ: 128,
        local: ['0.0.0.0', 22],
        peer: ['0.0.0.0', '*'],
        process: proc('sshd', 3),
      });
      v6.push({
        state: 'LISTEN',
        recvQ: 0,
        sendQ: 128,
        local: ['[::]', 22],
        peer: ['[::]', '*'],
        process: proc('sshd', 4),
      });
    } else if (service.name === 'apache2') {
      rows.push({
        state: 'LISTEN',
        recvQ: 0,
        sendQ: 511,
        local: ['*', 80],
        peer: ['*', '*'],
        process: proc('apache2', 4, [...pids].reverse()),
      });
    } else if (service.name === 'nginx') {
      rows.push({
        state: 'LISTEN',
        recvQ: 0,
        sendQ: 511,
        local: ['0.0.0.0', 80],
        peer: ['0.0.0.0', '*'],
        process: proc('nginx', 6, [...pids].reverse()),
      });
      v6.push({
        state: 'LISTEN',
        recvQ: 0,
        sendQ: 511,
        local: ['[::]', 80],
        peer: ['[::]', '*'],
        process: proc('nginx', 7, [...pids].reverse()),
      });
    } else if (service.name === 'mariadb') {
      rows.push({
        state: 'LISTEN',
        recvQ: 0,
        sendQ: 80,
        local: ['127.0.0.1', 3306],
        peer: ['0.0.0.0', '*'],
        process: proc('mariadbd', 22),
      });
    }
  }
  return [...rows, ...v6];
}

/** Session SSH du joueur (connexion établie). */
function sshSession(machine: Machine): SocketRow | null {
  const own = machine.interfaces.find((i) => i.name !== 'lo' && i.up && i.ipv4);
  if (!own?.ipv4 || machine.services['ssh']?.state !== 'active') return null;
  return {
    state: 'ESTAB',
    recvQ: 0,
    sendQ: 0,
    local: [own.ipv4.split('/')[0] ?? '', 22],
    peer: [intToPeer(own.ipv4), '51544'],
    process: `users:(("sshd",pid=1186,fd=4),("sshd",pid=1180,fd=4))`,
  };
}

/** Adresse du poste de l'apprenant : la 50e du réseau local. */
function intToPeer(cidrText: string): string {
  const cidr = parseCidr(cidrText);
  const net = cidr ? ipToInt(networkOf(cidr)) : null;
  return net === null
    ? '192.168.10.50'
    : [24, 16, 8, 0].map((s) => ((net + 50) >>> s) & 255).join('.');
}

/** Commande `ss` : sockets réseau (ports en écoute, connexions). */
export const ss: BashCommand = {
  name: 'ss',
  summary: 'affiche les sockets réseau (ports en écoute, connexions)',
  package: 'iproute2',
  manual: `NOM
       ss - afficher les sockets réseau

SYNOPSIS
       ss [OPTIONS]

DESCRIPTION
       Montre quels programmes écoutent sur quels ports, et les connexions en
       cours. Le nom des programmes (-p) n'est visible qu'en root (sudo).

       -t   TCP        -u   UDP        -l   seulement en écoute
       -a   tout       -n   ports en chiffres (pas de nom de service)
       -p   programme et PID

EXEMPLES
       sudo ss -tlnp        qui écoute sur quel port TCP ?`,
  run(args, env) {
    const flags = new Set<string>();
    for (const arg of args) {
      if (!arg.startsWith('-')) return { stderr: `ss: bad option "${arg}"\n`, exitCode: 1 };
      for (const ch of arg.replace(/^--?/, '')) flags.add(ch);
    }
    for (const f of flags)
      if (!'tulanp4'.includes(f)) return { stderr: `ss: invalid option -- '${f}'\n`, exitCode: 1 };
    const tcp = flags.has('t') || !flags.has('u');
    const listening = flags.has('l');
    const all = flags.has('a');
    let rows: SocketRow[] = [];
    if (tcp) {
      const listen = tcpSockets(env.machine);
      const session = sshSession(env.machine);
      if (listening) rows = listen;
      else if (all) rows = [...listen, ...(session ? [session] : [])];
      else rows = session ? [session] : [];
    }
    const showProcess = flags.has('p') && env.user === 'root';
    const numeric = flags.has('n');
    const port = (p: number | string) =>
      typeof p === 'number' && !numeric ? (PORT_NAMES[p] ?? String(p)) : String(p);
    const localAddrW = Math.max('Local Address'.length, ...rows.map((r) => r.local[0].length));
    const localPortW = Math.max('Port'.length, ...rows.map((r) => port(r.local[1]).length));
    const peerAddrW = Math.max('Peer Address'.length, ...rows.map((r) => r.peer[0].length));
    const peerPortW = Math.max('Port'.length, ...rows.map((r) => r.peer[1].length));
    const netid = !flags.has('t') && !flags.has('u') && !listening;
    let stdout = `${netid ? 'Netid ' : ''}${'State'.padEnd(6)} Recv-Q Send-Q ${'Local Address'.padStart(localAddrW)}:${'Port'.padEnd(localPortW)} ${'Peer Address'.padStart(peerAddrW)}:${'Port'.padEnd(peerPortW)}${showProcess ? 'Process' : ''}\n`;
    for (const r of rows) {
      stdout += `${netid ? 'tcp   ' : ''}${r.state.padEnd(6)} ${String(r.recvQ).padEnd(6)} ${String(r.sendQ).padEnd(6)} ${r.local[0].padStart(localAddrW)}:${port(r.local[1]).padEnd(localPortW)} ${r.peer[0].padStart(peerAddrW)}:${r.peer[1].padEnd(peerPortW)}${showProcess ? r.process : ''}\n`;
    }
    return { stdout, exitCode: 0 };
  },
};

// --- ifup / ifdown -------------------------------------------------------------------

/** Message d'ifupdown sans les droits root. */
const IFUPDOWN_LOCK = (cmd: string) =>
  `${cmd}: failed to open lockfile /run/network/.ifstate.lock: Permission denied\n`;

/** Active une interface d'après sa déclaration. */
export function bringUp(machine: Machine, stanza: IfaceStanza, env: CommandEnv): CommandOutcome {
  const iface = machine.interfaces.find((i) => i.name === stanza.name);
  if (!iface)
    return {
      stderr: `Cannot find device "${stanza.name}"\nifup: failed to bring up ${stanza.name}\n`,
      exitCode: 1,
    };
  if (stanza.method === 'loopback')
    return { machine: withInterface(machine, iface.name, { up: true }), exitCode: 0 };
  if (stanza.method === 'dhcp') {
    // Le routeur du site distribue des baux à partir de la 100e adresse.
    const own = parseCidr(iface.ipv4 ?? '') ?? parseCidr('192.168.10.20/24');
    const net = ipToInt(networkOf(own ?? { address: '192.168.10.0', prefix: 24 })) ?? 0;
    const leased = [24, 16, 8, 0].map((s) => ((net + 105) >>> s) & 255).join('.');
    const gateway = neighborsOf(machine)[0]?.address ?? '';
    const cidr = { address: leased, prefix: own?.prefix ?? 24 };
    const next: Machine = {
      ...withInterface(machine, iface.name, {
        up: true,
        ipv4: `${leased}/${cidr.prefix}`,
        dhcp: true,
      }),
      routes: [
        ...machine.routes.filter((r) => r.device !== iface.name),
        { destination: 'default', gateway, device: iface.name },
        kernelRoute(iface.name, cidr),
      ],
    };
    return {
      machine: next,
      stderr: `Internet Systems Consortium DHCP Client 4.4.3-P1\nCopyright 2004-2022 Internet Systems Consortium.\nAll rights reserved.\nFor info, please visit https://www.isc.org/software/dhcp/\n\nListening on LPF/${iface.name}/${iface.mac}\nSending on   LPF/${iface.name}/${iface.mac}\nSending on   Socket/fallback\nDHCPDISCOVER on ${iface.name} to 255.255.255.255 port 67 interval 7\nDHCPOFFER of ${leased} from ${gateway}\nDHCPREQUEST for ${leased} on ${iface.name} to 255.255.255.255 port 67\nDHCPACK of ${leased} from ${gateway}\nbound to ${leased} -- renewal in 1726 seconds.\n`,
      exitCode: 0,
    };
  }
  if (stanza.method !== 'static')
    return {
      stderr: `/etc/network/interfaces: unknown method "${stanza.method}" for ${stanza.name}\n`,
      exitCode: 1,
    };
  const address = stanza.options['address'];
  if (!address)
    return {
      stderr: `ifup: missing required variable: address\nifup: missing required configuration variables for interface ${stanza.name}/inet\nifup: failed to bring up ${stanza.name}\n`,
      exitCode: 1,
    };
  let cidr = parseCidr(address);
  const netmask = stanza.options['netmask'];
  if (cidr && !address.includes('/')) {
    const prefix = netmask ? (isIpv4(netmask) ? maskToPrefix(netmask) : Number(netmask)) : 32;
    cidr = prefix === null || Number.isNaN(prefix) ? null : { address: cidr.address, prefix };
  }
  if (!cidr)
    return {
      stderr: `Error: any valid prefix is expected rather than "${address}".\nifup: failed to bring up ${stanza.name}\n`,
      exitCode: 1,
    };
  let next: Machine = {
    ...withInterface(machine, iface.name, {
      up: true,
      ipv4: `${cidr.address}/${cidr.prefix}`,
      dhcp: false,
    }),
    routes: [
      ...machine.routes.filter((r) => r.device !== iface.name),
      kernelRoute(iface.name, cidr),
    ],
  };
  const gateway = stanza.options['gateway'];
  if (gateway) {
    if (!isIpv4(gateway) || !inSubnet(gateway, cidr))
      return {
        machine: next,
        stderr: `Error: Nexthop has invalid gateway.\nifup: failed to bring up ${stanza.name}\n`,
        exitCode: 1,
      };
    next = {
      ...next,
      routes: [
        { destination: 'default', gateway, device: iface.name },
        ...next.routes.filter((r) => r.destination !== 'default'),
      ],
    };
  }
  void env;
  return { machine: next, exitCode: 0 };
}

/** ifup et ifdown partagent l'analyse des arguments. */
function ifupdown(args: readonly string[], env: CommandEnv, up: boolean): CommandOutcome {
  const name = up ? 'ifup' : 'ifdown';
  if (env.user !== 'root') return { stderr: IFUPDOWN_LOCK(name), exitCode: 1 };
  const { stanzas, auto } = readInterfaces(env.machine);
  const targets = args.includes('-a') ? auto : args.filter((a) => !a.startsWith('-'));
  if (targets.length === 0) return { stderr: `${name}: no interface(s) specified\n`, exitCode: 1 };
  let machine = env.machine;
  let stderr = '';
  let exitCode = 0;
  for (const target of targets) {
    const stanza = stanzas.find((s) => s.name === target);
    const iface = machine.interfaces.find((i) => i.name === target);
    const configured = iface !== undefined && iface.up && (iface.ipv4 !== null || target === 'lo');
    if (!stanza) {
      stderr += `${name}: unknown interface ${target}\n`;
      exitCode = 1;
      continue;
    }
    if (up) {
      if (configured) {
        stderr += `ifup: interface ${target} already configured\n`;
        continue;
      }
      const result = bringUp(machine, stanza, env);
      machine = result.machine ?? machine;
      stderr += result.stderr ?? '';
      if (result.exitCode !== 0) exitCode = result.exitCode;
    } else {
      if (!configured) {
        stderr += `ifdown: interface ${target} not configured\n`;
        continue;
      }
      machine = withoutRoutesOf(
        withInterface(machine, target, {
          up: false,
          ipv4: target === 'lo' ? '127.0.0.1/8' : null,
          dhcp: false,
        }),
        target,
      );
    }
  }
  return { machine, stderr, exitCode };
}

/** Commande `ifup` : active une interface d'après /etc/network/interfaces. */
export const ifup: BashCommand = {
  name: 'ifup',
  summary: 'active une interface réseau selon /etc/network/interfaces',
  package: 'ifupdown',
  manual: `NOM
       ifup, ifdown - activer ou désactiver une interface réseau

SYNOPSIS
       ifup INTERFACE      ifdown INTERFACE      ifup -a

DESCRIPTION
       Appliquent la configuration écrite dans /etc/network/interfaces
       (méthode static avec address, netmask, gateway ; ou dhcp). Après une
       modification du fichier : ifdown puis ifup sur l'interface.
       -a   toutes les interfaces marquées « auto »

EXEMPLES
       sudo ifdown ens33 && sudo ifup ens33`,
  run: (args, env) => ifupdown(args, env, true),
};

/** Commande `ifdown` : désactive une interface configurée. */
export const ifdown: BashCommand = {
  name: 'ifdown',
  summary: 'désactive une interface réseau',
  package: 'ifupdown',
  manual: ifup.manual,
  run: (args, env) => ifupdown(args, env, false),
};
