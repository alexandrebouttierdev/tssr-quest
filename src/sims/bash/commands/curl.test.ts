import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine } from '../test-utils';

const up = debianServer({ services: { apache2: { state: 'active' } } });
const down = debianServer({ services: { apache2: { state: 'failed' } } });

describe('commande curl', () => {
  it("affiche les en-têtes d'un site qui répond", () => {
    const out = runLine(up, 'curl -I http://localhost').stdout;

    expect(out.split('\n')[0]).toBe('HTTP/1.1 200 OK');
    expect(out).toContain('Server: Apache/2.4.62 (Debian)');
    expect(out).toContain('Content-Type: text/html');
  });

  it('affiche la page, avec les en-têtes si -i', () => {
    expect(runLine(up, 'curl localhost').stdout).toContain('<h1>Intranet LabCorp</h1>');
    expect(runLine(up, 'curl -i 127.0.0.1').stdout).toMatch(/^HTTP\/1.1 200 OK[\s\S]*<html/);
  });

  it('répond 404 pour une page absente', () => {
    expect(runLine(up, 'curl -I srv-web01/absent.html').stdout.split('\n')[0]).toBe(
      'HTTP/1.1 404 Not Found',
    );
    expect(runLine(up, 'curl 192.168.10.20/absent').stdout).toContain(
      '<title>404 Not Found</title>',
    );
  });

  it('échoue quand aucun serveur web ne tourne', () => {
    const result = runLine(down, 'curl -I localhost');

    expect(result.stderr).toBe(
      "curl: (7) Failed to connect to localhost port 80 after 0 ms: Couldn't connect to server\n",
    );
    expect(result.exitCode).toBe(7);
  });

  it('ne résout pas un nom inconnu et ne joint pas une adresse externe', () => {
    expect(runLine(up, 'curl https://example.org').exitCode).toBe(6);
    expect(runLine(up, 'curl http://10.0.0.1:8080/').exitCode).toBe(28);
  });

  it("refuse l'absence d'URL", () => {
    expect(runLine(up, 'curl').exitCode).toBe(2);
    expect(runLine(up, 'curl "http://"').exitCode).toBe(3);
  });

  it('identifie nginx comme serveur', () => {
    const nginx = debianServer({ services: { nginx: { state: 'active' } } });

    expect(runLine(nginx, 'curl -I localhost').stdout).toContain('Server: nginx/1.22.1');
  });
});
