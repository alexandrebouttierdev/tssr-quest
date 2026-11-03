/**
 * Réseau d'une machine simulée, à l'échelle d'un poste ou d'un serveur (phase 1) :
 * adresses IPv4, routage, voisins du réseau local, résolution de noms. Le moteur de
 * topologies complet (VLAN, NAT, ACL, traces de paquets) arrive en phase 2 dans
 * `sims/network` ; ce module en reste le cas simple et sert `ping`, `ip`, `ifup`, APT.
 */
import type { Machine, NetInterface, Neighbor } from './types';

/**
 * Convertit une adresse IPv4 en entier non signé.
 *
 * @param ip - Adresse (`192.168.10.20`).
 * @returns L'entier, ou `null` si l'adresse est invalide.
 */
export function ipToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    value = value * 256 + n;
  }
  return value >>> 0;
}

/**
 * Convertit un entier en adresse IPv4.
 *
 * @param value - Entier non signé.
 * @returns L'adresse pointée.
 */
export function intToIp(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join('.');
}

/** Masque d'un préfixe (`24` → 0xffffff00). */
function maskOf(prefix: number): number {
  return prefix <= 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

/** Adresse en notation CIDR, découpée. */
export interface Cidr {
  readonly address: string;
  readonly prefix: number;
}

/**
 * Lit une adresse en notation CIDR (`192.168.10.20/24`).
 *
 * @param text - Adresse et préfixe.
 * @returns L'adresse découpée, ou `null` si invalide.
 */
export function parseCidr(text: string): Cidr | null {
  const [address = '', prefixText] = text.split('/');
  const prefix = prefixText === undefined ? 32 : Number(prefixText);
  if (ipToInt(address) === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32)
    return null;
  return { address, prefix };
}

/**
 * Convertit un masque pointé (`255.255.255.0`) en préfixe.
 *
 * @param mask - Masque.
 * @returns Le préfixe, ou `null` si le masque n'est pas contigu.
 */
export function maskToPrefix(mask: string): number | null {
  const value = ipToInt(mask);
  if (value === null) return null;
  const prefix = value.toString(2).replace(/0+$/, '').length;
  return maskOf(prefix) === value ? prefix : null;
}

/** Adresse de réseau d'une adresse CIDR. */
export function networkOf(cidr: Cidr): string {
  return intToIp(((ipToInt(cidr.address) ?? 0) & maskOf(cidr.prefix)) >>> 0);
}

/** Adresse de diffusion d'une adresse CIDR. */
export function broadcastOf(cidr: Cidr): string {
  return intToIp(((ipToInt(cidr.address) ?? 0) | ~maskOf(cidr.prefix)) >>> 0);
}

/** Vrai si `ip` appartient au réseau de `cidr`. */
export function inSubnet(ip: string, cidr: Cidr): boolean {
  const a = ipToInt(ip);
  const b = ipToInt(cidr.address);
  if (a === null || b === null) return false;
  const mask = maskOf(cidr.prefix);
  return (a & mask) >>> 0 === (b & mask) >>> 0;
}

/** Vrai si le texte est une adresse IPv4 valide. */
export function isIpv4(text: string): boolean {
  return ipToInt(text) !== null;
}

/**
 * Hôtes publics connus du simulateur (miroirs Debian, DNS publics, site de LabCorp).
 * Les adresses sont celles qu'ils ont réellement ; ils répondent au ping dès que la
 * machine a une route vers Internet.
 */
export const PUBLIC_HOSTS: Readonly<Record<string, string>> = {
  'deb.debian.org': '151.101.130.132',
  'security.debian.org': '151.101.194.132',
  'ftp.fr.debian.org': '212.27.32.66',
  'www.debian.org': '151.101.2.132',
  'dns.google': '8.8.8.8',
  'one.one.one.one': '1.1.1.1',
  'www.labcorp.fr': '203.0.113.10',
};

/** Adresses publiques qui répondent au ping. */
const PUBLIC_ADDRESSES = new Set<string>([
  ...Object.values(PUBLIC_HOSTS),
  '8.8.4.4',
  '1.0.0.1',
  '9.9.9.9',
]);

/** Interfaces actives avec une adresse IPv4, hors boucle locale. */
export function activeInterfaces(machine: Machine): (NetInterface & { cidr: Cidr })[] {
  return machine.interfaces.flatMap((i) => {
    const cidr = i.up && i.ipv4 ? parseCidr(i.ipv4) : null;
    return cidr && i.name !== 'lo' ? [{ ...i, cidr }] : [];
  });
}

/** Voisins du réseau local : ceux de la machine, ou par défaut passerelle et DNS. */
export function neighborsOf(machine: Machine): readonly Neighbor[] {
  return machine.neighbors ?? [];
}

/** Chemin vers une adresse. */
export type Route =
  | { readonly kind: 'local'; readonly source: string }
  | { readonly kind: 'link'; readonly device: string; readonly source: string }
  | {
      readonly kind: 'gateway';
      readonly device: string;
      readonly source: string;
      readonly gateway: string;
    }
  | { readonly kind: 'unreachable' };

/**
 * Trouve la route vers une adresse : la machine elle-même, son réseau local, ou la
 * passerelle par défaut.
 *
 * @param machine - Machine simulée.
 * @param ip - Adresse de destination.
 * @returns La route, ou `unreachable` (« Le réseau n'est pas accessible »).
 */
export function routeTo(machine: Machine, ip: string): Route {
  if (ip.startsWith('127.')) return { kind: 'local', source: '127.0.0.1' };
  const active = activeInterfaces(machine);
  const own = active.find((i) => i.cidr.address === ip);
  if (own) return { kind: 'local', source: ip };
  const link = active.find((i) => inSubnet(ip, i.cidr));
  if (link) return { kind: 'link', device: link.name, source: link.cidr.address };
  for (const route of machine.routes) {
    if (route.destination === 'default' || !route.gateway) continue;
    const net = parseCidr(route.destination);
    const via = active.find((i) => i.name === route.device);
    if (net && via && inSubnet(ip, net))
      return {
        kind: 'gateway',
        device: via.name,
        source: via.cidr.address,
        gateway: route.gateway,
      };
  }
  const fallback = machine.routes.find((r) => r.destination === 'default' && r.gateway);
  const device = fallback ? active.find((i) => i.name === fallback.device) : undefined;
  if (fallback?.gateway && device)
    return {
      kind: 'gateway',
      device: device.name,
      source: device.cidr.address,
      gateway: fallback.gateway,
    };
  return { kind: 'unreachable' };
}

/** Vrai si un voisin du réseau local a cette adresse. */
function neighborAnswers(machine: Machine, ip: string): boolean {
  return neighborsOf(machine).some((n) => n.address === ip);
}

/**
 * Indique si une adresse répond : la machine elle-même, un voisin du réseau local, ou
 * un hôte public joint par une passerelle qui répond.
 *
 * @param machine - Machine simulée.
 * @param ip - Adresse visée.
 * @returns Vrai si l'hôte répond.
 */
export function hostAnswers(machine: Machine, ip: string): boolean {
  const route = routeTo(machine, ip);
  switch (route.kind) {
    case 'local':
      return true;
    case 'link':
      return neighborAnswers(machine, ip);
    case 'gateway':
      return (
        neighborAnswers(machine, route.gateway) &&
        (PUBLIC_ADDRESSES.has(ip) || neighborAnswers(machine, ip))
      );
    case 'unreachable':
      return false;
  }
}

/** Vrai si la machine joint Internet (une passerelle qui répond). */
export function hasInternet(machine: Machine): boolean {
  return hostAnswers(machine, '8.8.8.8');
}

/** Serveurs DNS lus dans /etc/resolv.conf (à défaut, ceux de la machine). */
export function nameservers(machine: Machine): string[] {
  const node = machine.fs['/etc/resolv.conf'];
  if (node?.type !== 'file') return [...machine.dns.servers];
  return node.content
    .split('\n')
    .map((line) => /^\s*nameserver\s+(\S+)/.exec(line)?.[1])
    .filter((ip): ip is string => ip !== undefined && isIpv4(ip));
}

/** Domaines de recherche lus dans /etc/resolv.conf. */
function searchDomains(machine: Machine): string[] {
  const node = machine.fs['/etc/resolv.conf'];
  if (node?.type !== 'file') return [...machine.dns.search];
  return node.content.split('\n').flatMap((line) => {
    const m = /^\s*(?:search|domain)\s+(.+)$/.exec(line);
    return m?.[1] ? m[1].trim().split(/\s+/) : [];
  });
}

/** Résultat d'une résolution de nom. */
export type Resolution =
  | { readonly ok: true; readonly address: string; readonly name: string }
  | { readonly ok: false; readonly reason: 'unknown' | 'no-server' };

/**
 * Résout un nom comme la glibc : adresse littérale, /etc/hosts, puis DNS (il faut
 * qu'un serveur de /etc/resolv.conf réponde).
 *
 * @param machine - Machine simulée.
 * @param name - Nom ou adresse.
 * @returns L'adresse, ou la cause de l'échec.
 */
export function resolveHost(machine: Machine, name: string): Resolution {
  if (isIpv4(name)) return { ok: true, address: name, name };
  const hosts = machine.fs['/etc/hosts'];
  if (hosts?.type === 'file') {
    for (const line of hosts.content.split('\n')) {
      const [address, ...names] = line.replace(/#.*/, '').trim().split(/\s+/);
      if (address && isIpv4(address) && names.includes(name)) return { ok: true, address, name };
    }
  }
  if (name === 'localhost') return { ok: true, address: '127.0.0.1', name };
  const servers = nameservers(machine).filter((ip) => hostAnswers(machine, ip));
  if (servers.length === 0) return { ok: false, reason: 'no-server' };
  // Comme la glibc : un nom court est complété par les domaines de recherche ; le DNS
  // renvoie alors le nom complet (srv-dc01.labcorp.local).
  const domains = searchDomains(machine);
  const candidates = name.includes('.') ? [name] : [...domains.map((d) => `${name}.${d}`), name];
  for (const candidate of candidates) {
    const known = PUBLIC_HOSTS[candidate];
    if (known) return { ok: true, address: known, name: candidate };
    const short = candidate.split('.')[0] ?? '';
    const suffix = candidate.slice(short.length + 1);
    const neighbor = neighborsOf(machine).find((n) => n.name === short);
    if (neighbor && domains.includes(suffix))
      return { ok: true, address: neighbor.address, name: candidate };
  }
  return { ok: false, reason: 'unknown' };
}

/** Adresse IPv6 de lien local dérivée d'une adresse MAC (EUI-64). */
export function linkLocalOf(mac: string): string {
  const bytes = mac.split(':').map((b) => parseInt(b, 16));
  if (bytes.length !== 6 || bytes.some((b) => Number.isNaN(b))) return 'fe80::1';
  const [a = 0, b = 0, c = 0, d = 0, e = 0, f = 0] = bytes;
  const words = [((a ^ 2) << 8) | b, (c << 8) | 0xff, 0xfe00 | d, (e << 8) | f];
  return `fe80::${words.map((w) => w.toString(16)).join(':')}`;
}
