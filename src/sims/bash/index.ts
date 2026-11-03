/** Simulateur Bash : point d'entrée public. */
export { bashSimulator } from './simulator';
export { ALL_BASH_COMMANDS, BASH_COMMANDS } from './commands/registry';
export { runLine } from './interpreter';
export type { BashCommand, CommandEnv, CommandOutcome } from './command';
