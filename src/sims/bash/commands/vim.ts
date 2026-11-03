import { statPath } from '@sims/shared/fs';
import type { BashCommand } from '../command';

/** Page de manuel de vim (partagée avec vi). */
const MANUAL = `NOM
       vim - éditeur de texte présent sur tous les serveurs

SYNOPSIS
       vim FICHIER

DESCRIPTION
       vim a des MODES. Au départ, on est en mode normal : les touches sont des
       commandes, pas du texte.

       i          passer en insertion (taper du texte)
       Échap      revenir au mode normal
       :w         enregistrer            :q     quitter
       :wq        enregistrer et quitter :q!    quitter SANS enregistrer
       dd         supprimer la ligne     x      supprimer un caractère
       yy / p     copier / coller la ligne
       u          annuler                /mot   chercher (n : suivant)
       gg / G     début / fin du fichier :set number  numéros de ligne

À RETENIR
       Pour sortir de vim : Échap, puis :q! et Entrée (sans enregistrer) ou
       :wq et Entrée (en enregistrant).`;

/** Crée la commande `vim` ou `vi` : ouvre l'éditeur sur un fichier. */
function editorCommand(name: 'vim' | 'vi'): BashCommand {
  return {
    name,
    summary: name === 'vim' ? 'éditeur de texte modal' : 'éditeur de texte (vim)',
    manual: MANUAL,
    run(args, env) {
      const operand = args.find((a) => !a.startsWith('-') && !a.startsWith('+'));
      if (operand === undefined) {
        return {
          stderr: `${name} : indique le fichier à éditer (par exemple « ${name} notes.txt »).\n`,
          exitCode: 1,
        };
      }
      const path = env.resolve(operand);
      const found = statPath(env.machine, path, env.user);
      if (found.ok && found.value.node.type === 'dir')
        return { stderr: `"${operand}" est un répertoire\n`, exitCode: 1 };
      return { exitCode: 0, effects: [{ type: 'open-editor', path }] };
    },
  };
}

/** Commande `vim`. */
export const vim = editorCommand('vim');
/** Commande `vi` (lien vers vim sur Debian). */
export const vi = editorCommand('vi');
