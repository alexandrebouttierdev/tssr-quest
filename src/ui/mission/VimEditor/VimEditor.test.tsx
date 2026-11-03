import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { EditorView } from '@core/store/mission-run.slice';
import { keyFromEvent, VimEditor } from './VimEditor';

const view: EditorView = {
  fileName: '/home/hugo/app.conf',
  lines: ['port=80', 'host=srv'],
  cursor: { row: 0, col: 2 },
  mode: 'normal',
  commandLine: '',
  message: '"app.conf" 2L, 17B',
  messageIsError: false,
  number: true,
};

describe('<VimEditor>', () => {
  it("affiche le texte, les numéros, les « ~ » et la ligne d'état", () => {
    render(<VimEditor view={view} onKey={() => undefined} />);

    const editor = screen.getByRole('textbox', { name: 'Éditeur vim : /home/hugo/app.conf' });
    expect(editor).toHaveFocus();
    expect(editor).toHaveTextContent('1 port=80');
    expect(screen.getAllByText('~')).toHaveLength(16);
    expect(screen.getByText('"app.conf" 2L, 17B')).toBeInTheDocument();
    expect(screen.getByText('1,3')).toBeInTheDocument();
  });

  it('affiche la ligne de commande et les erreurs', () => {
    const { rerender } = render(
      <VimEditor view={{ ...view, mode: 'command', commandLine: 'wq' }} onKey={() => undefined} />,
    );
    expect(screen.getByText(':wq', { selector: 'span' })).toBeInTheDocument();
    rerender(
      <VimEditor view={{ ...view, mode: 'search', commandLine: 'srv' }} onKey={() => undefined} />,
    );
    expect(screen.getByText('/srv')).toBeInTheDocument();
    rerender(
      <VimEditor
        view={{
          ...view,
          message: null,
          messageIsError: true,
          number: false,
          cursor: { row: 1, col: 9 },
        }}
        onKey={() => undefined}
      />,
    );
    expect(screen.getByRole('textbox')).toHaveTextContent('host=srv');
  });

  it('envoie les touches tapées et les touches rapides', async () => {
    const user = userEvent.setup();
    const onKey = vi.fn();
    render(<VimEditor view={view} onKey={onKey} />);

    await user.keyboard('i{Escape}{Enter}{Control>}c{/Control}{Control>}x{/Control}{F2}');
    await user.click(screen.getByRole('button', { name: ':wq' }));

    expect(onKey.mock.calls.map((c) => String(c[0]))).toEqual([
      'i',
      'Escape',
      'Enter',
      'Ctrl+c',
      'Escape',
      ':',
      'w',
      'q',
      'Enter',
    ]);
  });

  it('traduit les événements clavier', () => {
    expect(keyFromEvent({ key: 'a', ctrlKey: false, metaKey: false, altKey: false })).toBe('a');
    expect(keyFromEvent({ key: 'ArrowUp', ctrlKey: false, metaKey: false, altKey: false })).toBe(
      'ArrowUp',
    );
    expect(
      keyFromEvent({ key: 'Shift', ctrlKey: false, metaKey: false, altKey: false }),
    ).toBeNull();
    expect(keyFromEvent({ key: 'v', ctrlKey: false, metaKey: true, altKey: false })).toBeNull();
  });
});
