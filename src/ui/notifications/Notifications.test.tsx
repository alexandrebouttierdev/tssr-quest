import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithServices } from '../test-utils';
import { Notifications } from './Notifications';

describe('<Notifications>', () => {
  afterEach(() => vi.useRealTimers());

  it('traduit les événements du moteur en notifications', () => {
    const { bus } = renderWithServices(<Notifications />);

    act(() => {
      bus.emit({
        type: 'mission/completed',
        missionId: 'm',
        result: {
          perfectSteps: 2,
          totalSteps: 2,
          errors: 0,
          hintsUsed: 0,
          durationMs: 1,
          xpEarned: 210,
        },
      });
      bus.emit({ type: 'progression/level-up', level: 2 });
      bus.emit({ type: 'ui/notify', message: 'Sauvegarde effectuée', kind: 'info' });
    });

    expect(screen.getByText('Mission terminée : +210 XP')).toBeInTheDocument();
    expect(
      screen.getByText('Niveau 2 ! Tu es maintenant Technicien·ne support N1.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Sauvegarde effectuée')).toBeInTheDocument();
  });

  it('retire une notification au clic', async () => {
    const user = userEvent.setup();
    const { store } = renderWithServices(<Notifications />);
    act(() => void store.getState().pushNotification({ message: 'Bonjour', kind: 'info' }));

    await user.click(screen.getByRole('button', { name: 'Fermer la notification' }));

    expect(store.getState().ui.notifications).toEqual([]);
  });

  it('retire les notifications après 4 secondes', () => {
    vi.useFakeTimers();
    const { store } = renderWithServices(<Notifications />);
    act(() => void store.getState().pushNotification({ message: 'Bonjour', kind: 'info' }));

    act(() => void vi.advanceTimersByTime(4100));

    expect(store.getState().ui.notifications).toEqual([]);
  });
});
