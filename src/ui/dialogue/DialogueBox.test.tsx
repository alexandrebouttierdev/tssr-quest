import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { DialogueView } from '@core/store/ui.slice';
import { DialogueBox } from './DialogueBox';

const line: DialogueView = {
  npcId: 'hugo',
  nodeId: 'intro',
  speaker: 'Hugo',
  role: 'Administrateur systèmes',
  mood: 'inquiet',
  text: 'Ah, te voilà !',
  choices: [],
};

describe('<DialogueBox>', () => {
  it("affiche le nom, le rôle et le texte, et annonce la réplique aux lecteurs d'écran", () => {
    render(
      <DialogueBox
        view={line}
        textSpeed={0}
        reducedMotion={false}
        onAdvance={() => undefined}
        onChoose={() => undefined}
      />,
    );

    expect(screen.getByText('Hugo')).toBeInTheDocument();
    expect(screen.getByText(/Administrateur systèmes/)).toBeInTheDocument();
    expect(screen.getByText('Hugo : Ah, te voilà !')).toBeInTheDocument();
  });

  it('fait apparaître le texte progressivement, et le termine au clic', () => {
    vi.useFakeTimers();
    const onAdvance = vi.fn();
    render(
      <DialogueBox
        view={line}
        textSpeed={10}
        reducedMotion={false}
        onAdvance={onAdvance}
        onChoose={() => undefined}
      />,
    );
    act(() => void vi.advanceTimersByTime(300));
    expect(screen.getByText('Ah,')).toBeInTheDocument();

    act(() => screen.getByRole('region', { name: 'Dialogue' }).click());
    expect(screen.getByText('Ah, te voilà !', { selector: 'p[aria-hidden]' })).toBeInTheDocument();
    expect(onAdvance).not.toHaveBeenCalled();

    act(() => screen.getByRole('region', { name: 'Dialogue' }).click());
    expect(onAdvance).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it('passe à la suite avec Entrée ou Espace', async () => {
    const user = userEvent.setup();
    const onAdvance = vi.fn();
    render(
      <DialogueBox
        view={line}
        textSpeed={0}
        reducedMotion={false}
        onAdvance={onAdvance}
        onChoose={() => undefined}
      />,
    );

    await user.keyboard('{Enter}');
    await user.keyboard(' ');

    expect(onAdvance).toHaveBeenCalledTimes(2);
  });

  it('propose les choix, navigables aux flèches, et transmet le choix', async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    const onAdvance = vi.fn();
    const view = {
      ...line,
      choices: [
        { id: '0', text: 'Oui, un indice' },
        { id: '1', text: 'Non, je gère' },
      ],
    };
    render(
      <DialogueBox
        view={view}
        textSpeed={0}
        reducedMotion
        onAdvance={onAdvance}
        onChoose={onChoose}
      />,
    );

    expect(screen.getByRole('button', { name: 'Oui, un indice' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('button', { name: 'Non, je gère' })).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowLeft}');
    await user.keyboard('{Enter}');

    expect(onChoose).toHaveBeenCalledWith('1');
    expect(onAdvance).not.toHaveBeenCalled();
    await user.keyboard('x');
  });

  it('avance avec le bouton suite', async () => {
    const user = userEvent.setup();
    const onAdvance = vi.fn();
    render(
      <DialogueBox
        view={line}
        textSpeed={0}
        reducedMotion={false}
        onAdvance={onAdvance}
        onChoose={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Suite' }));

    expect(onAdvance).toHaveBeenCalledTimes(1);
  });

  it('choisit une réponse avec sa touche numérotée et affiche le portrait', async () => {
    const user = userEvent.setup();
    const onChoose = vi.fn();
    const view = {
      ...line,
      choices: [
        { id: 'a', text: 'Oui, un indice' },
        { id: 'b', text: 'Non, je gère' },
      ],
    };
    const { container } = render(
      <DialogueBox
        view={view}
        textSpeed={0}
        reducedMotion
        onAdvance={vi.fn()}
        onChoose={onChoose}
      />,
    );

    expect(container.querySelector('img')?.getAttribute('src')).toBe('/sprites/portraits/hugo.png');
    expect(container.querySelector('[data-mood="inquiet"]')).not.toBeNull();
    await user.keyboard('2');
    expect(onChoose).toHaveBeenCalledWith('b');
  });
});
