import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
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
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /Parler à Hugo/ })).not.toBeInTheDocument(),
    );
  });

  it("rappelle les contrôles à l'arrivée puis les efface", async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      renderWithServices(<Hud />);
      expect(screen.getByRole('note')).toHaveTextContent('ZQSD');
      act(() => {
        vi.advanceTimersByTime(12_000);
      });
    } finally {
      vi.useRealTimers();
    }
    await waitFor(() => expect(screen.queryByRole('note')).not.toBeInTheDocument());
  });

  it("affiche l'heure de jeu, les tickets, les alertes et l'objectif", () => {
    renderWithServices(<Hud />, {
      ticketBoard: () => ({
        open: [
          {
            missionId: 'm',
            number: 2046,
            title: "L'intranet est tombé",
            priority: 'critique',
            giverName: 'Hugo',
            zoneName: 'Salle serveurs',
          },
        ],
        alerts: 1,
        objective: {
          kind: 'ticket',
          ticket: {
            missionId: 'm',
            number: 2046,
            title: "L'intranet est tombé",
            priority: 'critique',
            giverName: 'Hugo',
            zoneName: 'Salle serveurs',
          },
        },
      }),
    });

    expect(screen.getByLabelText('mar. 3 nov., 09:26')).toBeInTheDocument();
    expect(screen.getByText('1 ticket ouvert')).toBeInTheDocument();
    expect(screen.getByText('1 alerte')).toBeInTheDocument();
    const objective = screen.getByRole('region', { name: 'Objectif' });
    expect(objective).toHaveTextContent('Ticket #2046');
    expect(objective).toHaveTextContent('Critique');
    expect(objective).toHaveTextContent('Va voir Hugo · Salle serveurs');
  });

  it('résume la mission en cours et annonce les gains d’XP', () => {
    const { store } = renderWithServices(<Hud />, {
      ticketBoard: () => ({
        open: [],
        alerts: 0,
        objective: {
          kind: 'mission',
          title: 'Panne',
          ticketNumber: null,
          stepIndex: 1,
          stepCount: 3,
          done: 2,
          total: 2,
          goal: 'Relancer Apache',
        },
      }),
    });

    const objective = screen.getByRole('region', { name: 'Objectif' });
    expect(objective).toHaveTextContent('Étape 2/3');
    expect(objective).toHaveTextContent('2/2 objectifs');
    expect(screen.getByText('Aucune alerte')).toBeInTheDocument();
    act(() => store.getState().setProgression({ xp: 40 }));
    expect(screen.getByRole('status')).toHaveTextContent('+40 XP');
  });

  it("propose d'explorer quand aucun ticket n'attend", () => {
    renderWithServices(<Hud />);
    expect(screen.getByRole('region', { name: 'Objectif' })).toHaveTextContent(
      'Aucun ticket en attente',
    );
  });
});
