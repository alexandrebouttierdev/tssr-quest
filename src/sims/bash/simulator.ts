import type { CommandLineSimulator } from '@sims/shared/simulator';
import { formatSystemdTimestamp } from '@sims/shared/time-format';
import type { Machine } from '@sims/shared/types';
import { ALL_BASH_COMMANDS } from './commands/registry';
import { completeBash } from './completion';
import { runLine } from './interpreter';
import { bashPrompt } from './prompt';

/** Le simulateur Bash d'une Debian 12, conforme à l'interface commune des simulateurs. */
export const bashSimulator: CommandLineSimulator<Machine> = {
  id: 'bash',
  prompt: bashPrompt,
  exec(state, line, ctx) {
    const result = runLine(state, line, ctx, ALL_BASH_COMMANDS);
    return {
      state: result.machine,
      stdout: result.output
        .filter((o) => o.stream === 'stdout')
        .map((o) => o.text)
        .join(''),
      stderr: result.output
        .filter((o) => o.stream === 'stderr')
        .map((o) => o.text)
        .join(''),
      exitCode: result.exitCode,
      effects: result.effects,
      output: result.output,
    };
  },
  complete: (state, partial) => completeBash(state, partial, ALL_BASH_COMMANDS),
  banner(state, ctx) {
    const lastLogin = formatSystemdTimestamp(ctx.now.getTime() - 25 * 60_000).split(' ');
    // sshd affiche la dernière connexion en anglais, au format de ctime().
    const [, date = '', time = ''] = lastLogin;
    const [year, month, day] = date.split('-');
    const months = [
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec',
    ];
    const motd = state.fs['/etc/motd'];
    return [
      `Linux ${state.hostname} 6.1.0-26-amd64 #1 SMP PREEMPT_DYNAMIC Debian 6.1.112-1 (2024-09-30) x86_64`,
      motd?.type === 'file' ? motd.content.replace(/\n$/, '') : '',
      `Last login: ${lastLogin[0] ?? ''} ${months[Number(month) - 1] ?? ''} ${String(Number(day)).padStart(2)} ${time} ${year ?? ''} from 192.168.10.23`,
    ].join('\n');
  },
};
