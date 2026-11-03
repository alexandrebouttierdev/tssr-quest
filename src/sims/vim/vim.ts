/**
 * Éditeur modal minimal façon vim (docs/03, `sims/vim`) : modes normal, insertion,
 * commande et recherche. État immuable, une touche à la fois ; l'écriture du fichier
 * est demandée par un effet `write` que l'appelant applique (avec les droits du compte).
 */

/** Mode de l'éditeur. */
export type VimMode = 'normal' | 'insert' | 'command' | 'search';

/** Position du curseur (ligne et colonne, à partir de 0). */
export interface Cursor {
  readonly row: number;
  readonly col: number;
}

/** Effet demandé à l'appelant. */
export type VimEffect =
  | { readonly type: 'write'; readonly content: string; readonly force: boolean }
  | { readonly type: 'quit' };

/** État de l'éditeur. */
export interface VimState {
  readonly path: string;
  readonly lines: readonly string[];
  readonly cursor: Cursor;
  readonly mode: VimMode;
  /** Texte en cours de saisie après `:` ou `/`. */
  readonly commandLine: string;
  /** Message de la ligne d'état (informations ou erreur). */
  readonly message: string | null;
  readonly messageIsError: boolean;
  readonly dirty: boolean;
  readonly readonly: boolean;
  readonly number: boolean;
  /** Lignes copiées (yy, dd). */
  readonly register: readonly string[];
  readonly undo: readonly { readonly lines: readonly string[]; readonly cursor: Cursor }[];
  /** Première touche d'une commande à deux touches (dd, yy, gg). */
  readonly pending: string | null;
  readonly lastSearch: string | null;
  /** Effets à appliquer, vidés par l'appelant après lecture. */
  readonly effects: readonly VimEffect[];
}

/** Nombre d'octets UTF-8 d'un texte. */
function bytes(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** Contenu du fichier : lignes terminées par un saut de ligne. */
export function vimContent(state: Pick<VimState, 'lines'>): string {
  return state.lines.length === 1 && state.lines[0] === '' ? '' : `${state.lines.join('\n')}\n`;
}

/** Nom du fichier affiché dans les messages. */
function shownName(path: string): string {
  return path.split('/').pop() ?? path;
}

/**
 * Ouvre un fichier dans l'éditeur.
 *
 * @param path - Chemin affiché dans les messages.
 * @param content - Contenu actuel (`null` pour un nouveau fichier).
 * @param readonly - Vrai si le compte ne peut pas écrire le fichier.
 * @returns L'état initial, curseur en haut, mode normal.
 */
export function openVim(path: string, content: string | null, readonly: boolean): VimState {
  const lines = content === null || content === '' ? [''] : content.replace(/\n$/, '').split('\n');
  const info =
    content === null
      ? `"${shownName(path)}" [Nouveau]`
      : `"${shownName(path)}"${readonly ? ' [lecture seule]' : ''} ${content === '' ? 0 : lines.length}L, ${bytes(content)}B`;
  return {
    path,
    lines,
    cursor: { row: 0, col: 0 },
    mode: 'normal',
    commandLine: '',
    message: info,
    messageIsError: false,
    dirty: false,
    readonly,
    number: false,
    register: [],
    undo: [],
    pending: null,
    lastSearch: null,
    effects: [],
  };
}

/** Garde le curseur dans le texte (en normal, pas après le dernier caractère). */
function clamp(state: VimState, cursor: Cursor): Cursor {
  const row = Math.max(0, Math.min(state.lines.length - 1, cursor.row));
  const length = (state.lines[row] ?? '').length;
  const max = state.mode === 'insert' ? length : Math.max(0, length - 1);
  return { row, col: Math.max(0, Math.min(max, cursor.col)) };
}

/** Enregistre l'état courant pour `u`. */
function snapshot(state: VimState): VimState {
  return {
    ...state,
    undo: [...state.undo.slice(-49), { lines: state.lines, cursor: state.cursor }],
  };
}

/** Remplace les lignes (modification du texte). */
function edit(state: VimState, lines: readonly string[], cursor: Cursor): VimState {
  return { ...state, lines: lines.length ? lines : [''], cursor, dirty: true };
}

/** Message d'erreur dans la ligne d'état. */
function error(state: VimState, message: string): VimState {
  return { ...state, message, messageIsError: true, mode: 'normal', commandLine: '' };
}

/** Début du mot suivant (w) ou précédent (b). */
function wordMove(state: VimState, forward: boolean): Cursor {
  const { row, col } = state.cursor;
  const line = state.lines[row] ?? '';
  if (forward) {
    const rest = line.slice(col);
    const m = /^\S*\s+/.exec(rest) ?? /^\W+\s*/.exec(rest);
    if (m && col + m[0].length < line.length) return { row, col: col + m[0].length };
    return row + 1 < state.lines.length
      ? { row: row + 1, col: (state.lines[row + 1] ?? '').search(/\S|$/) }
      : { row, col: Math.max(0, line.length - 1) };
  }
  const before = line.slice(0, col);
  const m = /\S+\s*$/.exec(before);
  if (m) return { row, col: col - m[0].length };
  return row > 0 ? { row: row - 1, col: 0 } : { row, col: 0 };
}

/** Recherche d'un motif à partir du curseur, avec retour au début. */
function search(state: VimState, pattern: string): VimState {
  const total = state.lines.length;
  for (let i = 1; i <= total; i++) {
    const row = (state.cursor.row + i) % total;
    const from = i === total ? state.cursor.col + 1 : 0;
    const col = (state.lines[row] ?? '').indexOf(
      pattern,
      row === state.cursor.row && i === total ? from : 0,
    );
    if (col >= 0) {
      return {
        ...state,
        cursor: { row, col },
        lastSearch: pattern,
        message: `/${pattern}`,
        messageIsError: false,
        mode: 'normal',
        commandLine: '',
      };
    }
  }
  return { ...error(state, `E486: Motif introuvable : ${pattern}`), lastSearch: pattern };
}

/** Exécute une commande `:`. */
function runCommand(state: VimState, raw: string): VimState {
  const command = raw.trim();
  const base: VimState = {
    ...state,
    mode: 'normal',
    commandLine: '',
    message: null,
    messageIsError: false,
  };
  if (command === '') return base;
  if (/^\d+$/.test(command))
    return { ...base, cursor: clamp(base, { row: Number(command) - 1, col: 0 }) };
  const write = (force: boolean): VimState => {
    if (state.readonly && !force)
      return error(state, "E45: L'option 'readonly' est activée (ajoutez ! pour passer outre)");
    const content = vimContent(state);
    return {
      ...base,
      dirty: false,
      message: `"${shownName(state.path)}" ${state.lines.length}L, ${bytes(content)}B écrit(s)`,
      effects: [...state.effects, { type: 'write', content, force }],
    };
  };
  switch (command) {
    case 'w':
      return write(false);
    case 'w!':
      return write(true);
    case 'q':
      return state.dirty
        ? error(state, 'E37: Modifications non enregistrées (ajoutez ! pour passer outre)')
        : { ...base, effects: [...state.effects, { type: 'quit' }] };
    case 'q!':
    case 'qa!':
      return { ...base, effects: [...state.effects, { type: 'quit' }] };
    case 'wq':
    case 'x':
    case 'wq!': {
      if (command === 'x' && !state.dirty)
        return { ...base, effects: [...state.effects, { type: 'quit' }] };
      const written = write(command === 'wq!');
      return written.messageIsError
        ? written
        : { ...written, effects: [...written.effects, { type: 'quit' }] };
    }
    case 'set number':
    case 'set nu':
      return { ...base, number: true };
    case 'set nonumber':
    case 'set nonu':
      return { ...base, number: false };
    default:
      return error(state, `E492: Pas une commande de l'éditeur : ${command}`);
  }
}

/** Touche en mode insertion. */
function insertKey(state: VimState, key: string): VimState {
  const { row, col } = state.cursor;
  const line = state.lines[row] ?? '';
  if (key === 'Escape')
    return {
      ...state,
      mode: 'normal',
      message: null,
      cursor: clamp({ ...state, mode: 'normal' }, { row, col: col - 1 }),
    };
  if (key === 'Enter') {
    const lines = [
      ...state.lines.slice(0, row),
      line.slice(0, col),
      line.slice(col),
      ...state.lines.slice(row + 1),
    ];
    return edit(state, lines, { row: row + 1, col: 0 });
  }
  if (key === 'Backspace') {
    if (col > 0)
      return edit(
        state,
        state.lines.map((l, i) => (i === row ? l.slice(0, col - 1) + l.slice(col) : l)),
        { row, col: col - 1 },
      );
    if (row === 0) return state;
    const previous = state.lines[row - 1] ?? '';
    const lines = [
      ...state.lines.slice(0, row - 1),
      previous + line,
      ...state.lines.slice(row + 1),
    ];
    return edit(state, lines, { row: row - 1, col: previous.length });
  }
  if (key === 'ArrowLeft' || key === 'ArrowRight' || key === 'ArrowUp' || key === 'ArrowDown')
    return { ...state, cursor: clamp(state, move(state.cursor, key)) };
  if (key === 'Tab') return insertKey(state, '\t');
  if ([...key].length !== 1) return state;
  return edit(
    state,
    state.lines.map((l, i) => (i === row ? l.slice(0, col) + key + l.slice(col) : l)),
    { row, col: col + 1 },
  );
}

/** Déplacement par flèche ou h/j/k/l. */
function move(cursor: Cursor, key: string): Cursor {
  if (key === 'h' || key === 'ArrowLeft') return { ...cursor, col: cursor.col - 1 };
  if (key === 'l' || key === 'ArrowRight') return { ...cursor, col: cursor.col + 1 };
  if (key === 'k' || key === 'ArrowUp') return { ...cursor, row: cursor.row - 1 };
  return { ...cursor, row: cursor.row + 1 };
}

/** Passe en insertion avec un instantané pour `u`. */
function enterInsert(
  state: VimState,
  cursor: Cursor,
  lines: readonly string[] = state.lines,
): VimState {
  const saved = snapshot(state);
  return {
    ...saved,
    lines,
    cursor,
    mode: 'insert',
    message: '-- INSERTION --',
    messageIsError: false,
    dirty: saved.dirty || lines !== state.lines,
  };
}

/** Touche en mode normal. */
function normalKey(state: VimState, key: string): VimState {
  const { row, col } = state.cursor;
  const line = state.lines[row] ?? '';
  if (state.pending) {
    const combo = state.pending + key;
    const cleared = { ...state, pending: null };
    if (combo === 'dd') {
      const saved = snapshot(cleared);
      const lines = state.lines.filter((_, i) => i !== row);
      return {
        ...edit(
          saved,
          lines,
          clamp({ ...saved, lines: lines.length ? lines : [''] }, { row, col: 0 }),
        ),
        register: [line],
      };
    }
    if (combo === 'yy') return { ...cleared, register: [line], message: null };
    if (combo === 'gg') return { ...cleared, cursor: clamp(cleared, { row: 0, col: 0 }) };
    return cleared;
  }
  switch (key) {
    case 'h':
    case 'j':
    case 'k':
    case 'l':
    case 'ArrowLeft':
    case 'ArrowRight':
    case 'ArrowUp':
    case 'ArrowDown':
      return { ...state, cursor: clamp(state, move(state.cursor, key)), message: null };
    case '0':
      return { ...state, cursor: { row, col: 0 } };
    case '$':
      return { ...state, cursor: clamp(state, { row, col: line.length }) };
    case 'G':
      return { ...state, cursor: clamp(state, { row: state.lines.length - 1, col: 0 }) };
    case 'w':
    case 'b':
      return { ...state, cursor: clamp(state, wordMove(state, key === 'w')) };
    case 'd':
    case 'y':
    case 'g':
      return { ...state, pending: key };
    case 'i':
      return enterInsert(state, state.cursor);
    case 'I':
      return enterInsert(state, { row, col: line.search(/\S|$/) });
    case 'a':
      return enterInsert(state, { row, col: line.length ? col + 1 : 0 });
    case 'A':
      return enterInsert(state, { row, col: line.length });
    case 'o':
    case 'O': {
      const at = key === 'o' ? row + 1 : row;
      return enterInsert(state, { row: at, col: 0 }, [
        ...state.lines.slice(0, at),
        '',
        ...state.lines.slice(at),
      ]);
    }
    case 'x': {
      if (!line) return state;
      const saved = snapshot(state);
      const lines = state.lines.map((l, i) => (i === row ? l.slice(0, col) + l.slice(col + 1) : l));
      return edit(saved, lines, clamp({ ...saved, lines }, { row, col }));
    }
    case 'p':
    case 'P': {
      if (state.register.length === 0) return state;
      const saved = snapshot(state);
      const at = key === 'p' ? row + 1 : row;
      return edit(
        saved,
        [...state.lines.slice(0, at), ...state.register, ...state.lines.slice(at)],
        { row: at, col: 0 },
      );
    }
    case 'u': {
      const last = state.undo.at(-1);
      if (!last)
        return {
          ...state,
          message: 'Déjà à la modification la plus ancienne',
          messageIsError: false,
        };
      return {
        ...state,
        lines: last.lines,
        cursor: last.cursor,
        undo: state.undo.slice(0, -1),
        dirty: true,
        message: '1 modification ; avant #1',
      };
    }
    case ':':
      return { ...state, mode: 'command', commandLine: '', message: null };
    case '/':
      return { ...state, mode: 'search', commandLine: '', message: null };
    case 'n':
      return state.lastSearch
        ? search(state, state.lastSearch)
        : error(state, 'E35: Aucune expression régulière précédente');
    case 'Ctrl+c':
      return {
        ...state,
        message: 'Tapez  :qa!  puis <Entrée> pour abandonner tous les changements et quitter Vim',
        messageIsError: false,
      };
    default:
      return state;
  }
}

/**
 * Applique une touche à l'éditeur.
 *
 * @param state - État courant.
 * @param key - Touche : caractère imprimable, ou `Escape`, `Enter`, `Backspace`, `Tab`,
 *   `ArrowUp`/`Down`/`Left`/`Right`, `Ctrl+c`.
 * @returns Le nouvel état (les effets à appliquer sont dans `effects`).
 */
export function vimKey(state: VimState, key: string): VimState {
  const fresh: VimState = state.effects.length ? { ...state, effects: [] } : state;
  if (fresh.mode === 'insert') return insertKey(fresh, key);
  if (fresh.mode === 'command' || fresh.mode === 'search') {
    if (key === 'Escape') return { ...fresh, mode: 'normal', commandLine: '' };
    if (key === 'Enter')
      return fresh.mode === 'command'
        ? runCommand(fresh, fresh.commandLine)
        : search(fresh, fresh.commandLine || (fresh.lastSearch ?? ''));
    if (key === 'Backspace')
      return fresh.commandLine
        ? { ...fresh, commandLine: fresh.commandLine.slice(0, -1) }
        : { ...fresh, mode: 'normal' };
    if ([...key].length !== 1) return fresh;
    return { ...fresh, commandLine: fresh.commandLine + key };
  }
  return normalKey(fresh, key);
}

/**
 * Découpe une suite de touches écrite comme dans les solutions de mission :
 * texte tapé tel quel, touches spéciales entre chevrons (`<Esc>`, `<CR>`, `<BS>`).
 *
 * @param keys - Par exemple `ihello<Esc>:wq<CR>`.
 * @returns Les touches, une par élément.
 */
export function parseKeys(keys: string): string[] {
  const names: Record<string, string> = {
    esc: 'Escape',
    cr: 'Enter',
    enter: 'Enter',
    bs: 'Backspace',
    tab: 'Tab',
    up: 'ArrowUp',
    down: 'ArrowDown',
    left: 'ArrowLeft',
    right: 'ArrowRight',
    'c-c': 'Ctrl+c',
  };
  const out: string[] = [];
  for (let i = 0; i < keys.length; i++) {
    if (keys[i] === '<') {
      const end = keys.indexOf('>', i);
      const name = end > 0 ? names[keys.slice(i + 1, end).toLowerCase()] : undefined;
      if (name) {
        out.push(name);
        i = end;
        continue;
      }
    }
    out.push(keys[i] ?? '');
  }
  return out;
}
