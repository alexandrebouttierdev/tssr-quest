import { describe, expect, it } from 'vitest';
import { openVim, parseKeys, vimContent, vimKey, type VimState } from './vim';

/** Tape une suite de touches. */
function type(state: VimState, keys: string): VimState {
  return parseKeys(keys).reduce(vimKey, state);
}

const file = openVim('/etc/app.conf', 'port=80\nhost=srv\n', false);

describe('ouverture', () => {
  it('affiche le nom, les lignes et les octets', () => {
    expect(file.message).toBe('"app.conf" 2L, 17B');
    expect(openVim('/tmp/x', null, false)).toMatchObject({ lines: [''], message: '"x" [Nouveau]' });
    expect(openVim('/etc/passwd', 'a\n', true).message).toBe('"passwd" [lecture seule] 1L, 2B');
    expect(openVim('/tmp/vide', '', false).message).toBe('"vide" 0L, 0B');
  });
});

describe('insertion', () => {
  it('insère du texte et repasse en normal avec Échap', () => {
    const state = type(file, 'idebug=1<CR><Esc>');

    expect(vimContent(state)).toBe('debug=1\nport=80\nhost=srv\n');
    expect(state.mode).toBe('normal');
    expect(state.dirty).toBe(true);
    expect(type(file, 'i').message).toBe('-- INSERTION --');
  });

  it('ajoute avec a, A, I, o, O', () => {
    expect(vimContent(type(file, 'A;<Esc>'))).toBe('port=80;\nhost=srv\n');
    expect(vimContent(type(file, 'ax<Esc>'))).toBe('pxort=80\nhost=srv\n');
    expect(vimContent(type(file, 'jI#<Esc>'))).toBe('port=80\n#host=srv\n');
    expect(vimContent(type(file, 'onew<Esc>'))).toBe('port=80\nnew\nhost=srv\n');
    expect(vimContent(type(file, 'Otop<Esc>'))).toBe('top\nport=80\nhost=srv\n');
    expect(vimContent(type(openVim('/x', null, false), 'aok<Esc>'))).toBe('ok\n');
  });

  it('efface avec Retour arrière, y compris en joignant les lignes', () => {
    expect(vimContent(type(file, 'A<BS><BS>8<Esc>'))).toBe('port=8\nhost=srv\n');
    expect(vimContent(type(file, 'ji<BS><Esc>'))).toBe('port=80host=srv\n');
    expect(vimContent(type(file, 'i<BS><Esc>'))).toBe('port=80\nhost=srv\n');
    expect(vimContent(type(file, 'i<Tab><Up><Right><Esc>'))).toBe('\tport=80\nhost=srv\n');
  });
});

describe('déplacements et édition en mode normal', () => {
  it('se déplace avec h j k l, 0, $, gg, G, w, b', () => {
    expect(type(file, 'jl').cursor).toEqual({ row: 1, col: 1 });
    expect(type(file, '$').cursor).toEqual({ row: 0, col: 6 });
    expect(type(file, '$0').cursor).toEqual({ row: 0, col: 0 });
    expect(type(file, 'Ggg').cursor).toEqual({ row: 0, col: 0 });
    expect(type(file, 'G').cursor.row).toBe(1);
    expect(type(file, 'kkhh<Down><Up><Left><Right>').cursor).toEqual({ row: 0, col: 1 });
    const words = openVim('/x', 'un deux trois\nquatre\n', false);
    expect(type(words, 'w').cursor).toEqual({ row: 0, col: 3 });
    expect(type(words, 'ww').cursor).toEqual({ row: 0, col: 8 });
    expect(type(words, 'www').cursor).toEqual({ row: 1, col: 0 });
    expect(type(words, 'wwb').cursor).toEqual({ row: 0, col: 3 });
    expect(type(words, 'jb').cursor).toEqual({ row: 0, col: 0 });
    expect(type(words, 'b').cursor).toEqual({ row: 0, col: 0 });
    expect(type(words, 'jw').cursor).toEqual({ row: 1, col: 5 });
  });

  it('supprime un caractère ou une ligne, copie, colle et annule', () => {
    expect(vimContent(type(file, 'x'))).toBe('ort=80\nhost=srv\n');
    expect(vimContent(type(file, 'dd'))).toBe('host=srv\n');
    expect(vimContent(type(file, 'ddp'))).toBe('host=srv\nport=80\n');
    expect(vimContent(type(file, 'yyP'))).toBe('port=80\nport=80\nhost=srv\n');
    expect(vimContent(type(file, 'xu'))).toBe('port=80\nhost=srv\n');
    expect(type(file, 'u').message).toBe('Déjà à la modification la plus ancienne');
    expect(vimContent(type(file, 'dddd'))).toBe('');
    expect(vimContent(type(openVim('/x', '', false), 'x'))).toBe('');
    expect(type(file, 'p')).toEqual(file);
    expect(type(file, 'dz').pending).toBeNull();
    expect(type(file, 'Z')).toEqual(file);
  });

  it('cherche un motif et passe au suivant', () => {
    const state = type(file, '/srv<CR>');
    expect(state.cursor).toEqual({ row: 1, col: 5 });
    expect(type(state, 'n').cursor).toEqual({ row: 1, col: 5 });
    expect(type(file, '/absent<CR>').message).toBe('E486: Motif introuvable : absent');
    expect(type(file, 'n').message).toBe('E35: Aucune expression régulière précédente');
    expect(type(file, '/abc<BS><BS><BS><BS>').mode).toBe('normal');
    expect(type(file, '/abc<Esc>').mode).toBe('normal');
    expect(type(type(file, '/srv<CR>'), '/<CR>').cursor).toEqual({ row: 1, col: 5 });
  });
});

describe('commandes', () => {
  it('écrit le fichier et quitte', () => {
    const written = type(file, 'x:w<CR>');
    expect(written.effects).toEqual([
      { type: 'write', content: 'ort=80\nhost=srv\n', force: false },
    ]);
    expect(written.message).toBe('"app.conf" 2L, 16B écrit(s)');
    expect(written.dirty).toBe(false);
    expect(type(file, 'x:wq<CR>').effects.map((e) => e.type)).toEqual(['write', 'quit']);
    expect(type(file, 'x:x<CR>').effects.map((e) => e.type)).toEqual(['write', 'quit']);
    expect(type(file, ':x<CR>').effects.map((e) => e.type)).toEqual(['quit']);
    expect(vimKey(written, 'j').effects).toEqual([]);
  });

  it('refuse de quitter sans enregistrer, sauf avec !', () => {
    expect(type(file, 'x:q<CR>').message).toBe(
      'E37: Modifications non enregistrées (ajoutez ! pour passer outre)',
    );
    expect(type(file, 'x:q!<CR>').effects).toEqual([{ type: 'quit' }]);
    expect(type(file, ':q<CR>').effects).toEqual([{ type: 'quit' }]);
    expect(type(file, ':qa!<CR>').effects).toEqual([{ type: 'quit' }]);
  });

  it('protège un fichier en lecture seule, sauf avec w!', () => {
    const ro = openVim('/etc/passwd', 'a\n', true);
    expect(type(ro, 'x:w<CR>').message).toBe(
      "E45: L'option 'readonly' est activée (ajoutez ! pour passer outre)",
    );
    expect(type(ro, 'x:wq<CR>').effects).toEqual([]);
    expect(type(ro, 'x:w!<CR>').effects[0]).toMatchObject({ type: 'write', force: true });
    expect(type(ro, 'x:wq!<CR>').effects.map((e) => e.type)).toEqual(['write', 'quit']);
  });

  it('numérote les lignes, va à une ligne et signale une commande inconnue', () => {
    expect(type(file, ':set number<CR>').number).toBe(true);
    expect(type(file, ':set nu<CR>:set nonu<CR>').number).toBe(false);
    expect(type(file, ':set nonumber<CR>').number).toBe(false);
    expect(type(file, ':2<CR>').cursor.row).toBe(1);
    expect(type(file, ':quitter<CR>').message).toBe(
      "E492: Pas une commande de l'éditeur : quitter",
    );
    expect(type(file, ':<CR>').mode).toBe('normal');
    expect(type(file, ':ab<BS><Esc>').mode).toBe('normal');
    expect(type(file, ':<BS>').mode).toBe('normal');
    expect(type(file, ':<Up>').commandLine).toBe('');
  });

  it('rappelle comment quitter après Ctrl+C', () => {
    expect(type(file, '<C-c>').message).toBe(
      'Tapez  :qa!  puis <Entrée> pour abandonner tous les changements et quitter Vim',
    );
  });
});

describe('touches des solutions', () => {
  it('découpe le texte et les touches spéciales', () => {
    expect(parseKeys('ia<Esc>:wq<CR><bs><Tab><Up><Down><Left><Right><enter><x>')).toEqual([
      'i',
      'a',
      'Escape',
      ':',
      'w',
      'q',
      'Enter',
      'Backspace',
      'Tab',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Enter',
      '<',
      'x',
      '>',
    ]);
  });
});
