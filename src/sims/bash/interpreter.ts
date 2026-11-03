import { strerror } from '@sims/shared/errors';
import { readFile, writeFile } from '@sims/shared/fs';
import { resolveUserPath } from '@sims/shared/path';
import type { SimEffect } from '@sims/shared/simulator';
import type { CommandRecord, Machine, SimContext } from '@sims/shared/types';
import { USR_BIN, USR_SBIN } from '@sims/shared/debian-files';
import type { Pipeline, Script, SimpleCommand } from './ast';
import type { BashCommand, CommandEnv, CommandOutcome } from './command';
import { ExpansionError, expandToString, expandWords, type ExpandEnv } from './expand';
import { BashSyntaxError } from './lexer';
import { parse } from './parser';

/** Morceau de sortie affiché au terminal, dans l'ordre d'écriture. */
export interface ShellOutput {
  readonly stream: 'stdout' | 'stderr';
  readonly text: string;
}

/** Résultat de l'exécution d'une ligne. */
export interface ShellResult {
  readonly machine: Machine;
  readonly output: readonly ShellOutput[];
  readonly exitCode: number;
  readonly effects: readonly SimEffect[];
}

/** PID du shell de la session (`$$`). */
const SHELL_PID = 1187;

/** Destination d'un descripteur de fichier. */
type FdTarget =
  | { readonly kind: 'terminal' }
  | { readonly kind: 'pipe' }
  | { readonly kind: 'file'; readonly path: string; readonly shown: string };

/** Commandes présentes sur le disque mais volontairement non simulées. */
const KNOWN_BINARIES = new Set<string>([...USR_BIN, ...USR_SBIN]);

/** État mutable de l'exécution d'une ligne (local à `runLine`). */
interface RunState {
  machine: Machine;
  output: ShellOutput[];
  effects: SimEffect[];
}

/**
 * Exécute une ligne de commande Bash sur une machine.
 *
 * @param machine - Machine de départ (la session donne le compte et le dossier courant).
 * @param line - Ligne saisie par le joueur.
 * @param ctx - Horloge et aléatoire de la simulation.
 * @param commands - Commandes disponibles.
 * @returns La nouvelle machine, la sortie dans l'ordre, le code de retour et les effets.
 */
export function runLine(
  machine: Machine,
  line: string,
  ctx: SimContext,
  commands: Readonly<Record<string, BashCommand>>,
): ShellResult {
  const state: RunState = { machine, output: [], effects: [] };
  let script: Script;
  try {
    script = parse(line);
  } catch (error) {
    if (!(error instanceof BashSyntaxError)) throw error;
    state.output.push({ stream: 'stderr', text: `${error.message}\n` });
    return finish(state, 2);
  }
  let status = state.machine.session.lastExitCode;
  let ran = false;
  for (const item of script.items) {
    if (ran && item.connector === '&&' && status !== 0) continue;
    if (ran && item.connector === '||' && status === 0) continue;
    status = runPipeline(state, item.pipeline, line, ctx, commands);
    ran = true;
    if (state.effects.some((e) => e.type === 'exit')) break;
  }
  return finish(state, ran ? status : state.machine.session.lastExitCode);
}

/** Enregistre le code de retour dans la session et construit le résultat. */
function finish(state: RunState, exitCode: number): ShellResult {
  const machine: Machine = {
    ...state.machine,
    session: { ...state.machine.session, lastExitCode: exitCode },
  };
  return { machine, output: state.output, exitCode, effects: state.effects };
}

/** Exécute un pipeline et renvoie son code de retour. */
function runPipeline(
  state: RunState,
  pipeline: Pipeline,
  line: string,
  ctx: SimContext,
  commands: Readonly<Record<string, BashCommand>>,
): number {
  let stdin = '';
  let status = 0;
  pipeline.commands.forEach((command, index) => {
    const isLast = index === pipeline.commands.length - 1;
    const result = runSimple(state, command, stdin, isLast, line, ctx, commands);
    stdin = result.piped;
    status = result.status;
  });
  if (pipeline.negated) return status === 0 ? 1 : 0;
  return status;
}

/** Contexte d'expansion construit à partir de l'état courant. */
function expandEnv(
  state: RunState,
  ctx: SimContext,
  commands: Readonly<Record<string, BashCommand>>,
): ExpandEnv {
  const { session } = state.machine;
  return {
    machine: state.machine,
    user: session.user,
    cwd: session.cwd,
    home: session.env['HOME'] ?? '/',
    vars: session.env,
    lastStatus: session.lastExitCode,
    pid: SHELL_PID,
    substitute: (source) => {
      // Sous-shell : les fichiers modifiés restent, la session (cd, variables) est rétablie.
      const sub = runLine(state.machine, source, ctx, commands);
      state.machine = { ...sub.machine, session: state.machine.session };
      for (const chunk of sub.output) if (chunk.stream === 'stderr') state.output.push(chunk);
      return sub.output
        .filter((c) => c.stream === 'stdout')
        .map((c) => c.text)
        .join('');
    },
  };
}

/** Exécute une commande simple ; renvoie son code et ce qu'elle écrit dans le tube. */
function runSimple(
  state: RunState,
  command: SimpleCommand,
  stdin: string,
  isLast: boolean,
  line: string,
  ctx: SimContext,
  commands: Readonly<Record<string, BashCommand>>,
): { status: number; piped: string } {
  const stderr = (text: string) => state.output.push({ stream: 'stderr', text });
  const now = ctx.now.getTime();
  let argv: string[];
  let assignments: [string, string][];
  try {
    const env = expandEnv(state, ctx, commands);
    assignments = command.assignments.map((a) => [a.name, expandToString(a.value, env)]);
    argv = expandWords(command.words, expandEnv(state, ctx, commands));
  } catch (error) {
    if (!(error instanceof ExpansionError)) throw error;
    stderr(`${error.message}\n`);
    return { status: 1, piped: '' };
  }

  // Redirections, dans l'ordre d'écriture (`> f 2>&1` n'est pas `2>&1 > f`).
  const session = state.machine.session;
  const home = session.env['HOME'] ?? '/';
  const fds: Record<number, FdTarget> = {
    1: isLast ? { kind: 'terminal' } : { kind: 'pipe' },
    2: { kind: 'terminal' },
  };
  let input = stdin;
  for (const redirection of command.redirections) {
    if (redirection.type === 'dup') {
      fds[redirection.fd] = fds[redirection.to] ?? { kind: 'terminal' };
      continue;
    }
    const targets = expandWords([redirection.target], expandEnv(state, ctx, commands));
    const shown = targets[0] ?? '';
    if (targets.length !== 1) {
      stderr(`bash: ${redirection.target.raw ?? ''}: redirection ambiguë\n`);
      return { status: 1, piped: '' };
    }
    const path = resolveUserPath(shown, session.cwd, home);
    if (redirection.type === 'file' && redirection.op === '<') {
      const read = readFile(state.machine, path, session.user);
      if (!read.ok) {
        stderr(`bash: ${shown}: ${strerror(read.error)}\n`);
        return { status: 1, piped: '' };
      }
      input = read.value;
      continue;
    }
    const append = redirection.type === 'both' ? redirection.append : redirection.op === '>>';
    // Le fichier est créé (ou vidé) avant l'exécution de la commande, comme dans bash.
    const opened = writeFile(state.machine, path, session.user, '', { append: true, now });
    const truncated =
      opened.ok && !append ? writeFile(opened.value, path, session.user, '', { now }) : opened;
    if (!truncated.ok) {
      stderr(`bash: ${shown}: ${strerror(truncated.error)}\n`);
      return { status: 1, piped: '' };
    }
    state.machine = truncated.value;
    const target: FdTarget = { kind: 'file', path, shown };
    if (redirection.type === 'both') {
      fds[1] = target;
      fds[2] = target;
    } else {
      fds[redirection.fd] = target;
    }
  }

  if (argv.length === 0) {
    if (assignments.length > 0) {
      const env = { ...session.env, ...Object.fromEntries(assignments) };
      state.machine = { ...state.machine, session: { ...state.machine.session, env } };
    }
    return { status: 0, piped: '' };
  }

  const [name = '', ...args] = argv;
  const outcome = execute(
    state,
    name,
    args,
    session.user,
    input,
    fds[1]?.kind === 'terminal',
    ctx,
    commands,
    Object.fromEntries(assignments),
  );
  if (outcome.machine) state.machine = outcome.machine;
  if (outcome.effects) state.effects.push(...outcome.effects);

  let piped = '';
  const route = (text: string | undefined, fd: 1 | 2) => {
    if (!text) return;
    const target = fds[fd] ?? { kind: 'terminal' };
    if (target.kind === 'terminal')
      state.output.push({ stream: fd === 1 ? 'stdout' : 'stderr', text });
    else if (target.kind === 'pipe') piped += text;
    else {
      const written = writeFile(state.machine, target.path, state.machine.session.user, text, {
        append: true,
        now,
      });
      if (written.ok) state.machine = written.value;
      else stderr(`bash: ${target.shown}: ${strerror(written.error)}\n`);
    }
  };
  route(outcome.stdout, 1);
  route(outcome.stderr, 2);

  const record: CommandRecord = {
    command: argv.join(' '),
    line,
    user: session.user,
    cwd: session.cwd,
    exitCode: outcome.exitCode,
    ok: outcome.ok ?? outcome.exitCode === 0,
    time: now,
  };
  state.machine = { ...state.machine, history: [...state.machine.history, record] };
  return { status: outcome.exitCode, piped };
}

/** Lance une commande par son nom, sous un compte donné. */
function execute(
  state: RunState,
  name: string,
  args: readonly string[],
  user: string,
  stdin: string,
  isTerminal: boolean,
  ctx: SimContext,
  commands: Readonly<Record<string, BashCommand>>,
  extraEnv: Readonly<Record<string, string>>,
  viaSudo = false,
): CommandOutcome {
  const commandName = name.includes('/') ? name.slice(name.lastIndexOf('/') + 1) : name;
  const command = Object.hasOwn(commands, commandName) ? commands[commandName] : undefined;
  if (!command || (viaSudo && command.builtin)) {
    const prefix = viaSudo ? 'sudo' : 'bash';
    if (!command && KNOWN_BINARIES.has(commandName)) {
      return {
        stderr: `${prefix}: ${name} : commande non disponible dans cette simulation\n`,
        exitCode: 127,
      };
    }
    return { stderr: `${prefix}: ${name} : commande introuvable\n`, exitCode: viaSudo ? 1 : 127 };
  }
  const machine = state.machine;
  const account = machine.users[user];
  const env: CommandEnv = {
    machine,
    user,
    cwd: machine.session.cwd,
    env: {
      ...machine.session.env,
      ...extraEnv,
      ...(viaSudo ? { USER: user, LOGNAME: user, HOME: account?.home ?? '/root' } : {}),
    },
    stdin,
    isTerminal,
    ctx,
    commands,
    resolve: (path) =>
      resolveUserPath(path, machine.session.cwd, machine.session.env['HOME'] ?? '/'),
    runAs: (asUser, argv) => {
      const [inner = '', ...innerArgs] = argv;
      return execute(state, inner, innerArgs, asUser, stdin, isTerminal, ctx, commands, {}, true);
    },
  };
  return command.run(args, env);
}
