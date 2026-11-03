import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine, runLines } from '../test-utils';

const LOG =
  [
    '192.168.10.23 GET /index.html 200',
    '192.168.10.40 GET /admin 403',
    '192.168.10.23 GET /index.html 200',
    '10.0.0.5 POST /login 500',
    '192.168.10.40 GET /admin 403',
  ].join('\n') + '\n';

const machine = debianServer({
  files: {
    '/home/hugo/access.log': { owner: 'hugo', content: LOG },
    '/home/hugo/nombres.txt': { owner: 'hugo', content: '10\n9\n100\n2K\n1G\n' },
    '/home/hugo/doublons.txt': { owner: 'hugo', content: 'a\na\nb\nA\na\n' },
    '/home/hugo/logs/app.log': { owner: 'hugo', content: 'error: disque plein\nok\n' },
    '/etc/secret.conf': { content: 'mdp\n', mode: '0600' },
  },
});

describe('head et tail', () => {
  it('affiche les premières et dernières lignes', () => {
    expect(runLine(machine, 'head -n 2 access.log').stdout).toBe(
      '192.168.10.23 GET /index.html 200\n192.168.10.40 GET /admin 403\n',
    );
    expect(runLine(machine, 'tail -n 1 access.log').stdout).toBe('192.168.10.40 GET /admin 403\n');
    expect(runLine(machine, 'tail -2 access.log').stdout.split('\n')).toHaveLength(3);
    expect(runLine(machine, 'tail -n +5 access.log').stdout).toBe('192.168.10.40 GET /admin 403\n');
    expect(runLine(machine, 'tail -n 0 access.log').stdout).toBe('');
    expect(runLine(machine, 'cat access.log | head -1').stdout).toBe(
      '192.168.10.23 GET /index.html 200\n',
    );
  });

  it('affiche des en-têtes pour plusieurs fichiers, et -f instantané', () => {
    expect(runLine(machine, 'head -n 1 nombres.txt doublons.txt').stdout).toBe(
      '==> nombres.txt <==\n10\n\n==> doublons.txt <==\na\n',
    );
    expect(runLine(machine, 'head -q -n 1 nombres.txt doublons.txt').stdout).toBe('10\na\n');
    expect(runLine(machine, 'echo x | head -v').stdout).toBe('==> entrée standard <==\nx\n');
    expect(runLine(machine, 'tail -f -n 1 nombres.txt').stdout).toBe('1G\n');
  });

  it('signale un nombre incorrect et un fichier illisible', () => {
    expect(runLine(machine, 'head -n abc access.log').stderr).toBe(
      'head: nombre de lignes incorrect : « abc »\n',
    );
    expect(runLine(machine, 'tail /etc/secret.conf').stderr).toBe(
      'tail: /etc/secret.conf: Permission non accordée\n',
    );
  });
});

describe('wc', () => {
  it('compte lignes, mots et octets', () => {
    expect(runLine(machine, 'wc -l access.log').stdout).toBe('5 access.log\n');
    expect(runLine(machine, 'cat access.log | wc -l').stdout).toBe('5\n');
    expect(runLine(machine, 'echo "un deux" | wc').stdout).toBe('      1       2       8\n');
    expect(runLine(machine, 'wc -w nombres.txt doublons.txt').stdout).toBe(
      ' 5 nombres.txt\n 5 doublons.txt\n10 total\n',
    );
    expect(runLine(machine, 'echo é | wc -cm').stdout).toBe('      2       3\n');
    expect(runLine(machine, 'wc -z').exitCode).toBe(1);
  });
});

describe('grep', () => {
  it('cherche un motif (BRE) et affiche les lignes', () => {
    expect(runLine(machine, 'grep 403 access.log').stdout).toBe(
      '192.168.10.40 GET /admin 403\n192.168.10.40 GET /admin 403\n',
    );
    expect(runLine(machine, 'grep -c 200 access.log').stdout).toBe('2\n');
    expect(runLine(machine, 'grep -n POST access.log').stdout).toBe('4:10.0.0.5 POST /login 500\n');
    expect(runLine(machine, "grep -v '^192' access.log").stdout).toBe('10.0.0.5 POST /login 500\n');
    expect(runLine(machine, "grep 'ad\\(min\\)' access.log").exitCode).toBe(0);
  });

  it('gère les options courantes', () => {
    expect(runLine(machine, 'grep -i ERROR logs/app.log').stdout).toBe('error: disque plein\n');
    expect(runLine(machine, 'grep -r disque logs').stdout).toBe(
      'logs/app.log:error: disque plein\n',
    );
    expect(runLine(machine, 'grep -l GET access.log logs/app.log').stdout).toBe('access.log\n');
    expect(runLine(machine, "grep -o '[0-9]\\{3\\}$' access.log").stdout).toBe(
      '200\n403\n200\n500\n403\n',
    );
    expect(runLine(machine, 'grep -E "(200|500)$" access.log').stdout.split('\n')).toHaveLength(4);
    expect(runLine(machine, 'grep -w GE access.log').exitCode).toBe(1);
    expect(runLine(machine, 'grep -x ok logs/app.log').stdout).toBe('ok\n');
    expect(runLine(machine, 'grep -q GET access.log')).toMatchObject({ stdout: '', exitCode: 0 });
    expect(runLine(machine, 'grep -F "[" access.log').exitCode).toBe(1);
    expect(
      runLine(machine, 'grep -e GET -h access.log logs/app.log').stdout.startsWith('192'),
    ).toBe(true);
    expect(runLine(machine, "grep '[[:digit:]]' doublons.txt").exitCode).toBe(1);
    expect(runLine(machine, 'cat access.log | grep login').stdout).toBe(
      '10.0.0.5 POST /login 500\n',
    );
  });

  it("renvoie 1 sans correspondance et 2 en cas d'erreur", () => {
    expect(runLine(machine, 'grep absent access.log').exitCode).toBe(1);
    expect(runLine(machine, 'grep x absent.txt')).toMatchObject({
      stderr: 'grep: absent.txt: Aucun fichier ou dossier de ce type\n',
      exitCode: 2,
    });
    expect(runLine(machine, 'grep x logs').stderr).toBe('grep: logs: Est un dossier\n');
    expect(runLine(machine, 'grep x /etc/secret.conf').stderr).toBe(
      'grep: /etc/secret.conf: Permission non accordée\n',
    );
    expect(runLine(machine, 'grep "[" access.log').stderr).toBe(
      'grep: Expression régulière invalide\n',
    );
    expect(runLine(machine, 'grep').exitCode).toBe(2);
    expect(runLine(machine, 'grep -Z x').exitCode).toBe(2);
  });

  it('egrep avertit de son obsolescence', () => {
    const result = runLine(machine, 'egrep "200|500" access.log');

    expect(result.stderr).toBe('egrep: warning: egrep is obsolescent; using grep -E\n');
    expect(result.stdout.split('\n')).toHaveLength(4);
  });
});

describe('cut, sort, uniq, tr, tee', () => {
  it('extrait des champs et des caractères', () => {
    expect(runLine(machine, 'cut -d: -f1 /etc/passwd | head -n 2').stdout).toBe('root\ndaemon\n');
    expect(runLine(machine, "cut -d ' ' -f1,4 access.log | head -n 1").stdout).toBe(
      '192.168.10.23 200\n',
    );
    expect(runLine(machine, 'cut -c1-3 nombres.txt | head -n 3').stdout).toBe('10\n9\n100\n');
    expect(runLine(machine, "cut -d ' ' -f2- access.log | head -n 1").stdout).toBe(
      'GET /index.html 200\n',
    );
    expect(runLine(machine, 'echo abc | cut -d: -f1').stdout).toBe('abc\n');
    expect(runLine(machine, 'echo abc | cut -s -d: -f1').stdout).toBe('');
    expect(runLine(machine, 'cut access.log').stderr).toContain('vous devez spécifier une liste');
    expect(runLine(machine, 'cut -f 0 access.log').stderr).toBe(
      'cut: champ ou plage de champs invalide\n',
    );
    expect(runLine(machine, 'cut -d ab -f1 access.log').stderr).toBe(
      'cut: le délimiteur doit être un seul caractère\n',
    );
    expect(runLine(machine, 'cut -z').exitCode).toBe(1);
  });

  it('trie en ordre alphabétique, numérique, lisible, inverse et unique', () => {
    expect(runLine(machine, 'sort nombres.txt').stdout).toBe('10\n100\n1G\n2K\n9\n');
    expect(runLine(machine, 'sort -n nombres.txt').stdout).toBe('1G\n2K\n9\n10\n100\n');
    expect(runLine(machine, 'sort -h nombres.txt').stdout).toBe('9\n10\n100\n2K\n1G\n');
    expect(runLine(machine, 'sort -r doublons.txt').stdout).toBe('b\nA\na\na\na\n');
    expect(runLine(machine, 'sort -u doublons.txt').stdout).toBe('a\nA\nb\n');
    expect(runLine(machine, 'sort -t: -k3 -n /etc/passwd | head -n 1').stdout).toMatch(/^root:/);
    expect(runLine(machine, 'sort -k4 access.log | head -n 1').stdout).toBe(
      '192.168.10.23 GET /index.html 200\n',
    );
    expect(runLine(machine, 'sort absent').exitCode).toBe(2);
    expect(runLine(machine, 'sort -z').exitCode).toBe(2);
  });

  it('compte les lignes identiques consécutives', () => {
    expect(runLine(machine, 'sort access.log | uniq -c').stdout).toBe(
      '      1 10.0.0.5 POST /login 500\n      2 192.168.10.23 GET /index.html 200\n      2 192.168.10.40 GET /admin 403\n',
    );
    expect(runLine(machine, 'uniq doublons.txt').stdout).toBe('a\nb\nA\na\n');
    expect(runLine(machine, 'uniq -d doublons.txt').stdout).toBe('a\n');
    expect(runLine(machine, 'uniq -u doublons.txt').stdout).toBe('b\nA\na\n');
    expect(runLine(machine, 'sort doublons.txt | uniq -i').stdout).toBe('a\nb\n');
    expect(runLine(machine, 'uniq -z').exitCode).toBe(1);
  });

  it('transforme des caractères', () => {
    expect(runLine(machine, 'echo bonjour | tr a-z A-Z').stdout).toBe('BONJOUR\n');
    expect(runLine(machine, 'echo bonjour | tr "[:lower:]" "[:upper:]"').stdout).toBe('BONJOUR\n');
    expect(runLine(machine, 'echo "a  b   c" | tr -s " "').stdout).toBe('a b c\n');
    expect(runLine(machine, 'echo "a1b2" | tr -d "[:digit:]"').stdout).toBe('ab\n');
    expect(runLine(machine, 'echo "a:b" | tr : "\\n"').stdout).toBe('a\nb\n');
    expect(runLine(machine, 'echo x | tr a').stderr).toContain("tr: opérande manquant après 'a'");
    expect(runLine(machine, 'tr -z').exitCode).toBe(1);
  });

  it("écrit dans des fichiers et à l'écran avec tee", () => {
    const result = runLines(machine, [
      'echo un | tee f.txt',
      'echo deux | tee -a f.txt > /dev/null',
      'cat f.txt',
    ]);

    expect(result.stdout).toBe('un\ndeux\n');
    expect(runLine(machine, 'echo x | tee /etc/x').stderr).toBe(
      'tee: /etc/x: Permission non accordée\n',
    );
    expect(runLine(machine, 'echo x | sudo tee /etc/x').exitCode).toBe(0);
    expect(runLine(machine, 'tee -z').exitCode).toBe(1);
  });
});

describe('more, less, printf, sleep', () => {
  it('affiche le fichier en entier', () => {
    expect(runLine(machine, 'less nombres.txt').stdout).toBe('10\n9\n100\n2K\n1G\n');
    expect(runLine(machine, 'more absent').exitCode).toBe(1);
  });

  it('formate du texte', () => {
    expect(runLine(machine, 'printf "%-6s|%5s|\\n" hugo admin').stdout).toBe('hugo  |admin|\n');
    expect(runLine(machine, 'printf "%s\\n" a b c').stdout).toBe('a\nb\nc\n');
    expect(runLine(machine, 'printf "%d %.2f %x %%\\n" 42.7 3.14159 255').stdout).toBe(
      '42 3,14 ff %\n',
    );
    expect(runLine(machine, 'printf "%.3s\\t\\"\\0101\\r\\\\"').stdout).toBe('\t"A\r\\');
    expect(runLine(machine, 'printf').exitCode).toBe(2);
  });

  it('attend (instantanément)', () => {
    expect(runLine(machine, 'sleep 0.5').exitCode).toBe(0);
    expect(runLine(machine, 'sleep').exitCode).toBe(1);
    expect(runLine(machine, 'sleep x').stderr).toContain('intervalle de temps « x » incorrect');
  });
});
