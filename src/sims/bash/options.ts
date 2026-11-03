/** Description des options acceptées par une commande. */
export interface OptionSpec {
  /** Nom de la commande, pour les messages d'erreur. */
  readonly name: string;
  /** Lettres des options courtes sans valeur (`lah`). */
  readonly short: string;
  /** Options longues et la lettre courte équivalente. */
  readonly long?: Readonly<Record<string, string>>;
  /** Lettres des options courtes qui attendent une valeur (`n` pour `-n 5`). */
  readonly withValue?: string;
}

/** Options reconnues ou message d'erreur prêt à afficher. */
export type ParsedOptions =
  | {
      readonly ok: true;
      readonly flags: ReadonlySet<string>;
      readonly values: ReadonlyMap<string, string>;
      readonly operands: readonly string[];
    }
  | { readonly ok: false; readonly message: string };

/** Message d'erreur getopt + invitation à lire l'aide (coreutils en fr_FR). */
function usageError(name: string, detail: string): ParsedOptions {
  return {
    ok: false,
    message: `${name}: ${detail}\nSaisissez « ${name} --help » pour plus d'informations.\n`,
  };
}

/**
 * Analyse les arguments à la manière de getopt : options courtes regroupables (`-la`),
 * options longues (`--all`), valeurs (`-n 5`, `-n5`), fin des options (`--`).
 *
 * @param args - Arguments de la commande (sans son nom).
 * @param spec - Options acceptées.
 * @returns Les options et opérandes, ou un message d'erreur.
 */
export function parseOptions(args: readonly string[], spec: OptionSpec): ParsedOptions {
  const flags = new Set<string>();
  const values = new Map<string, string>();
  const operands: string[] = [];
  const withValue = spec.withValue ?? '';
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '--') {
      operands.push(...args.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const [longName = '', inlineValue] = arg.slice(2).split('=', 2);
      const letter = spec.long?.[longName];
      if (letter === undefined) return usageError(spec.name, `option non reconnue « ${arg} »`);
      if (withValue.includes(letter)) {
        const value = inlineValue ?? args[++i];
        if (value === undefined)
          return usageError(spec.name, `l'option « --${longName} » requiert un argument`);
        values.set(letter, value);
      } else {
        flags.add(letter);
      }
      continue;
    }
    if (!arg.startsWith('-') || arg === '-') {
      operands.push(arg);
      continue;
    }
    for (let j = 1; j < arg.length; j++) {
      const letter = arg[j] ?? '';
      if (withValue.includes(letter)) {
        const value = arg.length > j + 1 ? arg.slice(j + 1) : args[++i];
        if (value === undefined)
          return usageError(spec.name, `l'option requiert un argument -- '${letter}'`);
        values.set(letter, value);
        break;
      }
      if (!spec.short.includes(letter))
        return usageError(spec.name, `option invalide -- '${letter}'`);
      flags.add(letter);
    }
  }
  return { ok: true, flags, values, operands };
}
