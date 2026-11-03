import { describe, expect, it } from 'vitest';
import { debianServer } from '@tests/fixtures/machines';
import { runLine, runLines } from './test-utils';

describe('interpréteur Bash', () => {
  const machine = debianServer({
    files: { '/home/hugo/notes.txt': { content: 'apache\nssh\ncron\n', owner: 'hugo' } },
  });

  it('enchaîne les commandes avec ;', () => {
    expect(runLine(machine, 'echo a; echo b').stdout).toBe('a\nb\n');
  });

  it("n'exécute la suite de && qu'en cas de succès", () => {
    expect(runLine(machine, 'false && echo non').stdout).toBe('');
    expect(runLine(machine, 'true && echo oui').stdout).toBe('oui\n');
  });

  it("n'exécute la suite de || qu'en cas d'échec", () => {
    expect(runLine(machine, 'false || echo secours').stdout).toBe('secours\n');
    expect(runLine(machine, 'true || echo non').stdout).toBe('');
  });

  it('enchaîne && et || de gauche à droite', () => {
    expect(runLine(machine, 'false && echo a || echo b').stdout).toBe('b\n');
  });

  it('transmet la sortie dans un tube', () => {
    expect(runLine(machine, 'cat notes.txt | cat -n').stdout).toBe(
      '     1\tapache\n     2\tssh\n     3\tcron\n',
    );
  });

  it('inverse le code de retour avec !', () => {
    expect(runLine(machine, '! false').exitCode).toBe(0);
    expect(runLine(machine, '! true').exitCode).toBe(1);
  });

  it('mémorise le code de retour dans $?', () => {
    const result = runLines(machine, ['false', 'echo $?']);

    expect(result.stdout).toBe('1\n');
  });

  it('redirige la sortie vers un fichier, en écrasant puis en ajoutant', () => {
    const result = runLines(machine, ['echo un > f.txt', 'echo deux >> f.txt', 'cat f.txt']);

    expect(result.stdout).toBe('un\ndeux\n');
    expect(result.state.fs['/home/hugo/f.txt']).toMatchObject({ owner: 'hugo', mode: 0o644 });
  });

  it("crée le fichier de redirection avant d'exécuter la commande", () => {
    const result = runLines(machine, ['ls > liste.txt', 'cat liste.txt']);

    expect(result.stdout).toContain('liste.txt');
  });

  it("lit l'entrée depuis un fichier avec <", () => {
    expect(runLine(machine, 'cat < notes.txt').stdout).toBe('apache\nssh\ncron\n');
  });

  it("redirige la sortie d'erreur, et la fusionne avec 2>&1", () => {
    const separated = runLines(machine, ['ls /absent 2> err.txt', 'cat err.txt']);
    const merged = runLines(machine, ['ls /absent > tout.txt 2>&1', 'cat tout.txt']);
    const both = runLines(machine, ['ls /absent &> tout2.txt', 'cat tout2.txt']);

    expect(separated.stdout).toContain("impossible d'accéder à '/absent'");
    expect(merged.stdout).toContain("impossible d'accéder à '/absent'");
    expect(both.stdout).toContain("impossible d'accéder à '/absent'");
  });

  it("refuse une redirection vers un fichier protégé, même avec sudo (c'est le shell qui écrit)", () => {
    const result = runLine(machine, 'sudo echo pirate > /etc/motd');

    expect(result.stderr).toBe('bash: /etc/motd: Permission non accordée\n');
    expect(result.exitCode).toBe(1);
  });

  it('signale une redirection ambiguë', () => {
    const result = runLine(machine, 'echo x > $VIDE');

    expect(result.stderr).toBe('bash: $VIDE: redirection ambiguë\n');
  });

  it("signale l'absence du fichier lu par <", () => {
    expect(runLine(machine, 'cat < absent').stderr).toBe(
      'bash: absent: Aucun fichier ou dossier de ce type\n',
    );
  });

  it('affecte une variable puis la relit', () => {
    expect(runLines(machine, ['SERVICE=apache2', 'echo $SERVICE']).stdout).toBe('apache2\n');
  });

  it('exécute une substitution de commande', () => {
    expect(runLine(machine, 'echo "Je suis $(whoami)"').stdout).toBe('Je suis hugo\n');
  });

  it('signale une commande inconnue avec le code 127', () => {
    const result = runLine(machine, 'apachectl');

    expect(result.stderr).toBe('bash: apachectl : commande introuvable\n');
    expect(result.exitCode).toBe(127);
  });

  it('signale une commande installée mais hors simulation', () => {
    expect(runLine(machine, 'awk').stderr).toBe(
      'bash: awk : commande non disponible dans cette simulation\n',
    );
  });

  it('accepte un chemin vers une commande connue', () => {
    expect(runLine(machine, '/usr/bin/whoami').stdout).toBe('hugo\n');
  });

  it('affiche les erreurs de syntaxe avec le code 2', () => {
    const result = runLine(machine, 'ls | | wc');

    expect(result.stderr).toBe('bash: erreur de syntaxe près du symbole inattendu « | »\n');
    expect(result.exitCode).toBe(2);
  });

  it("affiche les erreurs d'expansion", () => {
    expect(runLine(machine, 'echo ${a b}').stderr).toBe('bash: ${a b}: mauvaise substitution\n');
  });

  it('ne fait rien pour une ligne vide et garde le code précédent', () => {
    const result = runLines(machine, ['false', '   ']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
  });

  it("enregistre chaque commande exécutée dans l'historique", () => {
    const result = runLine(machine, 'echo a | cat; false');

    expect(result.state.history.map((h) => [h.command, h.ok, h.line])).toEqual([
      ['echo a', true, 'echo a | cat; false'],
      ['cat', true, 'echo a | cat; false'],
      ['false', true, 'echo a | cat; false'],
    ]);
  });

  it("s'arrête après exit et renvoie l'effet de fermeture", () => {
    const result = runLine(machine, 'exit; echo jamais');

    expect(result.effects).toEqual([{ type: 'exit' }]);
    expect(result.stdout).toBe('déconnexion\n');
  });

  it('exécute une commande sous root avec sudo', () => {
    expect(runLine(machine, 'sudo whoami').stdout).toBe('root\n');
  });

  it('refuse sudo pour une commande interne du shell', () => {
    expect(runLine(machine, 'sudo cd /root').stderr).toBe('sudo: cd : commande introuvable\n');
  });

  it('refuse sudo pour une commande inconnue', () => {
    expect(runLine(machine, 'sudo inconnu').stderr).toBe('sudo: inconnu : commande introuvable\n');
    expect(runLine(machine, 'sudo awk').stderr).toBe(
      'sudo: awk : commande non disponible dans cette simulation\n',
    );
  });

  it("garde la session d'origine après une substitution qui change de dossier", () => {
    const result = runLine(machine, 'echo $(cd /tmp; pwd); pwd');

    expect(result.stdout).toBe('/tmp\n/home/hugo\n');
  });
});
