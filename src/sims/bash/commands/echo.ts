import { success, type BashCommand } from '../command';

/** Interprète les séquences d'échappement de `echo -e`. */
function unescape(text: string): string {
  return text.replace(/\\([ntr\\]|0[0-7]{0,3})/g, (_m, seq: string) => {
    if (seq === 'n') return '\n';
    if (seq === 't') return '\t';
    if (seq === 'r') return '\r';
    if (seq === '\\') return '\\';
    return String.fromCharCode(parseInt(seq, 8));
  });
}

/** Commande `echo` : affiche ses arguments. */
export const echo: BashCommand = {
  name: 'echo',
  summary: 'affiche une ligne de texte',
  manual: `NOM
       echo - afficher une ligne de texte

SYNOPSIS
       echo [-n] [-e] [TEXTE...]

DESCRIPTION
       Affiche les arguments séparés par une espace, suivis d'un retour à la
       ligne.

       -n     ne pas ajouter le retour à la ligne final
       -e     interpréter les séquences \\n (nouvelle ligne) et \\t (tabulation)

EXEMPLES
       echo "Bonjour $USER"          affiche Bonjour suivi du nom du compte
       echo "ligne" >> notes.txt     ajoute une ligne à la fin d'un fichier`,
  run(args) {
    let newline = true;
    let escapes = false;
    let index = 0;
    while (index < args.length && /^-[neE]+$/.test(args[index] ?? '')) {
      const flags = args[index] ?? '';
      if (flags.includes('n')) newline = false;
      if (flags.includes('e')) escapes = true;
      if (flags.includes('E')) escapes = false;
      index++;
    }
    const text = args.slice(index).join(' ');
    return success((escapes ? unescape(text) : text) + (newline ? '\n' : ''));
  },
};
