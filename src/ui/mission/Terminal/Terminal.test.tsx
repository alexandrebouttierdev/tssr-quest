import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { TerminalLine } from '@core/store/mission-run.slice';
import { Terminal } from './Terminal';

/** Faux simulateur : renvoie une sortie fixe par commande. */
function FakeShell({
  outputs,
  complete,
}: {
  outputs: Record<string, string>;
  complete?: (p: string) => string[];
}) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  return (
    <Terminal
      prompt="hugo@srv:~$"
      lines={lines}
      {...(complete ? { onComplete: complete } : {})}
      onSubmit={(line) =>
        setLines((l) =>
          line === 'clear'
            ? []
            : [
                ...l,
                { kind: 'input', text: `hugo@srv:~$ ${line}` },
                { kind: 'stdout', text: outputs[line] ?? '' },
              ],
        )
      }
    />
  );
}

describe('<Terminal>', () => {
  it('exécute la commande saisie et affiche sa sortie', async () => {
    const user = userEvent.setup();
    render(<FakeShell outputs={{ whoami: 'hugo' }} />);

    await user.type(screen.getByRole('textbox', { name: 'Commande' }), 'whoami{Enter}');

    expect(screen.getByText('hugo')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Commande' })).toHaveValue('');
  });

  it('rappelle la commande précédente avec la flèche haut, et redescend', async () => {
    const user = userEvent.setup();
    render(<FakeShell outputs={{ pwd: '/home/hugo', ls: '' }} />);
    const input = screen.getByRole('textbox', { name: 'Commande' });

    await user.type(input, 'pwd{Enter}ls{Enter}{ArrowUp}{ArrowUp}');
    expect(input).toHaveValue('pwd');

    await user.type(input, '{ArrowDown}');
    expect(input).toHaveValue('ls');
  });

  it('complète le dernier mot avec Tab et affiche les possibilités multiples', async () => {
    const user = userEvent.setup();
    render(
      <FakeShell
        outputs={{}}
        complete={(p) => (p.endsWith('sys') ? ['systemctl'] : ['notes.txt', 'notes.md'])}
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Commande' });

    await user.type(input, 'sys{Tab}');
    expect(input).toHaveValue('systemctl ');

    await user.clear(input);
    await user.type(input, 'cat no{Tab}');
    expect(input).toHaveValue('cat notes.');
    expect(screen.getByText(/notes\.txt\s+notes\.md/)).toBeInTheDocument();
  });

  it("vide la saisie avec Ctrl+C et efface l'écran avec Ctrl+L", async () => {
    const user = userEvent.setup();
    render(<FakeShell outputs={{ whoami: 'hugo' }} />);
    const input = screen.getByRole('textbox', { name: 'Commande' });

    await user.type(input, 'whoami{Enter}abc{Control>}c{/Control}');
    expect(input).toHaveValue('');

    await user.type(input, '{Control>}l{/Control}');
    expect(screen.queryByText('hugo')).not.toBeInTheDocument();
  });

  it('insère les touches rapides du mobile', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<Terminal prompt="$" lines={[]} onSubmit={onSubmit} />);

    await user.click(screen.getByRole('button', { name: '|' }));
    await user.click(screen.getByRole('button', { name: '/' }));
    await user.click(screen.getByRole('button', { name: 'Ctrl+C' }));
    await user.click(screen.getByRole('button', { name: '~' }));
    await user.click(screen.getByRole('button', { name: 'Tab' }));
    await user.click(screen.getByRole('button', { name: '↑' }));

    expect(screen.getByRole('textbox', { name: 'Commande' })).toHaveValue('');
  });

  it("affiche l'aide du jeu et les lignes d'erreur", () => {
    render(
      <Terminal
        prompt="$"
        lines={[{ kind: 'stderr', text: 'erreur' }]}
        onSubmit={() => undefined}
        hint="Tape aide"
      />,
    );

    expect(screen.getByText('Tape aide')).toBeInTheDocument();
    expect(screen.getByText('erreur')).toBeInTheDocument();
  });
});
