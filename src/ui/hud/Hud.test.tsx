import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { renderWithServices } from '../test-utils';
import { Hud } from './Hud';

describe('<Hud>', () => {
  it("affiche le niveau, le titre et la progression d'XP", () => {
    const { store } = renderWithServices(<Hud />);
    act(() => {
      store.getState().setPlayerIdentity({ name: 'Alex', pronouns: 'elle' });
      store.getState().setProgression({ xp: 550, level: 2 });
    });

    expect(screen.getByText('Alex')).toBeInTheDocument();
    expect(screen.getByText('Niv. 2')).toBeInTheDocument();
    expect(screen.getByText('Technicien·ne support N1')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'XP' })).toHaveAttribute('aria-valuenow', '250');
    expect(screen.getByText('250 / 500 XP')).toBeInTheDocument();
  });

  it("affiche un nom par défaut et l'XP maximale", () => {
    const { store } = renderWithServices(<Hud />);
    act(() => store.getState().setProgression({ xp: 13000, level: 10 }));

    expect(screen.getByText('Apprenant·e')).toBeInTheDocument();
    expect(screen.getByText('XP maximale')).toBeInTheDocument();
  });

  it("affiche l'invite d'interaction et la transmet au toucher", async () => {
    const user = userEvent.setup();
    const { store, events } = renderWithServices(<Hud />);
    act(() => store.getState().setInteractionPrompt({ targetId: 'hugo', label: 'Hugo' }));

    await user.click(screen.getByRole('button', { name: 'E Parler à Hugo' }));

    expect(events).toEqual([{ type: 'world/interact', targetId: 'hugo' }]);
    act(() => store.getState().setInputMode('ui'));
    expect(screen.queryByRole('button', { name: /Parler à Hugo/ })).not.toBeInTheDocument();
  });
});
