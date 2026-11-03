import { readFile } from '@sims/shared/fs';
import type { Machine } from '@sims/shared/types';
import type { BashCommand } from '../command';

/** Date HTTP (RFC 7231) en temps universel. */
function httpDate(ms: number): string {
  return new Date(ms).toUTCString();
}

/** Indique si un nom d'hôte désigne la machine elle-même. */
function isLocal(machine: Machine, host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === machine.hostname) return true;
  if (host === `${machine.hostname}.${machine.dns.search[0] ?? ''}`) return true;
  return machine.interfaces.some((i) => i.ipv4?.split('/')[0] === host);
}

/** Commande `curl` : effectue une requête HTTP (serveur web local uniquement). */
export const curl: BashCommand = {
  name: 'curl',
  summary: 'interroge un serveur web (HTTP)',
  manual: `NOM
       curl - transférer des données depuis ou vers un serveur

SYNOPSIS
       curl [OPTION]... URL

DESCRIPTION
       Envoie une requête HTTP et affiche la réponse. Pratique pour vérifier
       qu'un site répond, depuis le serveur lui-même.

       -I     n'afficher que les en-têtes de la réponse (code HTTP, serveur…)
       -i     afficher les en-têtes puis le contenu
       -s     mode silencieux

EXEMPLES
       curl -I http://localhost     le serveur web répond-il ?`,
  run(args, env) {
    const head = args.includes('-I') || args.includes('--head');
    const include = args.includes('-i') || args.includes('--include');
    const url = args.find((a) => !a.startsWith('-'));
    if (url === undefined)
      return {
        stderr: "curl: try 'curl --help' or 'curl --manual' for more information\n",
        exitCode: 2,
      };
    const match = /^(?:(https?):\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/.exec(url);
    if (!match)
      return { stderr: `curl: (3) URL using bad/illegal format or missing URL\n`, exitCode: 3 };
    const [, scheme = 'http', host = '', portText, path = '/'] = match;
    const port = portText ? Number(portText) : scheme === 'https' ? 443 : 80;
    const machine = env.machine;
    if (!isLocal(machine, host)) {
      if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) {
        return {
          stderr: `curl: (28) Failed to connect to ${host} port ${port} after 130 ms: Couldn't connect to server\n`,
          exitCode: 28,
        };
      }
      return { stderr: `curl: (6) Could not resolve host: ${host}\n`, exitCode: 6 };
    }
    const server = Object.values(machine.services).find(
      (s) => s.state === 'active' && s.ports.includes(port),
    );
    if (!server) {
      return {
        stderr: `curl: (7) Failed to connect to ${host} port ${port} after 0 ms: Couldn't connect to server\n`,
        exitCode: 7,
      };
    }
    const now = env.ctx.now.getTime();
    const filePath = `/var/www/html${path === '/' ? '/index.html' : path}`;
    const page = readFile(machine, filePath, 'www-data');
    const serverName = server.name === 'nginx' ? 'nginx/1.22.1' : 'Apache/2.4.62 (Debian)';
    const notFound = `<!DOCTYPE HTML PUBLIC "-//IETF//DTD HTML 2.0//EN">\n<html><head>\n<title>404 Not Found</title>\n</head><body>\n<h1>Not Found</h1>\n<p>The requested URL was not found on this server.</p>\n<hr>\n<address>${serverName} Server at ${host} Port ${port}</address>\n</body></html>\n`;
    const body = page.ok ? page.value : notFound;
    const mtime = machine.fs[filePath]?.mtime ?? now;
    const headers = [
      page.ok ? 'HTTP/1.1 200 OK' : 'HTTP/1.1 404 Not Found',
      `Date: ${httpDate(now)}`,
      `Server: ${serverName}`,
      ...(page.ok
        ? [
            `Last-Modified: ${httpDate(mtime)}`,
            `ETag: "${new TextEncoder().encode(body).length.toString(16)}-${Math.floor(mtime / 1000).toString(16)}"`,
            'Accept-Ranges: bytes',
          ]
        : []),
      `Content-Length: ${new TextEncoder().encode(body).length}`,
      ...(page.ok ? ['Vary: Accept-Encoding'] : []),
      `Content-Type: text/html${page.ok ? '' : '; charset=iso-8859-1'}`,
    ];
    if (head) return { stdout: `${headers.join('\n')}\n\n`, exitCode: 0 };
    return { stdout: (include ? `${headers.join('\n')}\n\n` : '') + body, exitCode: 0 };
  },
};
