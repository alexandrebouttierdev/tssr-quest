import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import type { MissionRunView } from '@core/store/mission-run.slice';
import { renderWithServices } from '../test-utils';
import { MissionWindow } from './MissionWindow';

/** Vue de mission sur une étape de terminal. */
const terminalRun: MissionRunView = {
  missionId: 'linux-admin.intranet-down',
  title: "L'intranet est tombé",
  ticket: { number: 2046, priority: 'critique' },
  phase: 'step',
  stepIndex: 0,
  stepCount: 2,
  step: {
    type: 'terminal',
    id: 'diagnostic',
    goal: 'Trouve la panne.',
    sim: 'bash',
    machine: 'srv-web01',
    prompt: 'hugo@srv-web01:~$',
    lines: [{ kind: 'system', text: 'Linux srv-web01' }],
  },
  objectives: [
    { id: 'status', label: "Consulter l'état du service apache2", done: true },
    { id: 'restart', label: 'Relancer Apache', done: false },
  ],
  hints: [],
  hintCount: 3,
  sheet: 'fiche-systemctl',
  feedback: null,
  stepCompleted: false,
};

/** Rend la fenêtre avec une vue publiée dans le store. */
function setup(run: MissionRunView | null, sheet = true) {
  const result = renderWithServices(<MissionWindow />, {
    complete: (p) => (p === 'sys' ? ['systemctl'] : []),
    sheet: (id) =>
      sheet && id === 'fiche-systemctl'
        ? {
            title: 'Diagnostiquer un service',
            body: '**Réflexe** : lire `status`.\n\n- un\n- deux',
          }
        : undefined,
  });
  act(() => result.store.getState().setMissionRun(run));
  return result;
}

describe('<MissionWindow>', () => {
  it("n'affiche rien hors mission", () => {
    setup(null);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('affiche le ticket, la priorité, les objectifs et le terminal', () => {
    setup(terminalRun);

    expect(
      screen.getByRole('dialog', { name: "Ticket #2046 · L'intranet est tombé" }),
    ).toBeInTheDocument();
    expect(screen.getByText('Critique')).toBeInTheDocument();
    expect(screen.getByText(/Consulter l'état du service apache2/).closest('li')).toHaveAttribute(
      'data-done',
      'true',
    );
    expect(screen.getByText(/Relancer Apache/).closest('li')).toHaveAttribute('data-done', 'false');
    expect(screen.getByText('1/2')).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Commande' })).toBeInTheDocument();
  });

  it('envoie les commandes et demande des indices au moteur', async () => {
    const user = userEvent.setup();
    const { events } = setup(terminalRun);

    await user.type(screen.getByRole('textbox', { name: 'Commande' }), 'df -h{Enter}');
    await user.click(screen.getByRole('button', { name: /Indice \(3 restants\)/ }));

    expect(events).toEqual([
      { type: 'mission/step-input', payload: { line: 'df -h' } },
      { type: 'mission/hint-requested' },
    ]);
  });

  it('complète la commande avec les services du jeu', async () => {
    const user = userEvent.setup();
    setup(terminalRun);

    await user.type(screen.getByRole('textbox', { name: 'Commande' }), 'sys{Tab}');

    expect(screen.getByRole('textbox', { name: 'Commande' })).toHaveValue('systemctl ');
  });

  it('affiche les indices révélés, la fiche, et le retour du moteur', async () => {
    const user = userEvent.setup();
    setup({
      ...terminalRun,
      hints: ['Commence par le statut.'],
      feedback: { kind: 'error', code: 'incorrect' },
    });

    expect(screen.getByText('Commence par le statut.')).toBeInTheDocument();
    expect(screen.getByText(/Ce n'est pas ça/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fiche mémo' }));
    expect(screen.getByRole('dialog', { name: /Diagnostiquer un service/ })).toBeInTheDocument();
    expect(screen.getByText('status')).toBeInTheDocument();
    expect(screen.getByText('deux')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(screen.queryByRole('dialog', { name: /Diagnostiquer/ })).not.toBeInTheDocument();
  });

  it('demande confirmation avant de quitter', async () => {
    const user = userEvent.setup();
    const { events } = setup(terminalRun, false);
    expect(screen.queryByRole('button', { name: 'Fiche mémo' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Quitter' }));
    await user.click(screen.getByRole('button', { name: 'Fermer' }));
    expect(events).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Quitter' }));
    await user.click(screen.getByRole('button', { name: 'Quitter' }));

    expect(events).toEqual([{ type: 'mission/abandon' }]);
  });

  it("propose de continuer une fois l'étape réussie", async () => {
    const user = userEvent.setup();
    const { events } = setup({
      ...terminalRun,
      stepCompleted: true,
      feedback: { kind: 'success', code: 'step-complete' },
    });

    expect(screen.getByText('Tous les objectifs sont atteints.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Continuer' }));

    expect(events).toEqual([{ type: 'mission/continue' }]);
  });

  it('gère une étape à choix, puis le bouton de fin de mission', async () => {
    const user = userEvent.setup();
    const choice: MissionRunView = {
      ...terminalRun,
      stepIndex: 1,
      step: {
        type: 'choice',
        id: 'prevention',
        question: 'Comment éviter ?',
        options: [
          { id: '0', text: 'logrotate' },
          { id: '1', text: 'rm' },
        ],
        multiple: false,
      },
      objectives: [],
    };
    const { events, store } = setup(choice);

    await user.click(screen.getByLabelText('rm'));
    await user.click(screen.getByLabelText('logrotate'));
    await user.click(screen.getByRole('button', { name: 'Valider' }));
    expect(events).toEqual([{ type: 'mission/step-input', payload: { options: [0] } }]);

    act(() =>
      store.getState().setMissionRun({
        ...choice,
        stepCompleted: true,
        feedback: { kind: 'success', text: 'Bien vu.' },
      }),
    );
    expect(screen.getByText('Bien vu.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Terminer la mission' })).toHaveFocus();
  });

  it('gère une étape à choix multiples', async () => {
    const user = userEvent.setup();
    const { events } = setup({
      ...terminalRun,
      step: {
        type: 'choice',
        id: 'q',
        question: 'Lesquels ?',
        options: [
          { id: '0', text: 'A' },
          { id: '1', text: 'B' },
        ],
        multiple: true,
      },
    });

    await user.click(screen.getByLabelText('A'));
    await user.click(screen.getByLabelText('B'));
    await user.click(screen.getByLabelText('A'));
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(events).toEqual([{ type: 'mission/step-input', payload: { options: [1] } }]);
  });

  it('gère une étape de saisie', async () => {
    const user = userEvent.setup();
    const { events } = setup({
      ...terminalRun,
      step: { type: 'input', id: 'port', question: 'Quel port ?' },
    });

    await user.type(screen.getByLabelText('Quel port ?'), '80{Enter}');

    expect(events).toEqual([{ type: 'mission/step-input', payload: { text: '80' } }]);
  });

  it("gère une étape d'ordre au clavier", async () => {
    const user = userEvent.setup();
    const { events } = setup({
      ...terminalRun,
      step: {
        type: 'ordering',
        id: 'o',
        question: "Dans l'ordre ?",
        items: [
          { id: '1', text: 'Corriger' },
          { id: '0', text: 'Lire' },
        ],
      },
    });

    await user.click(screen.getByRole('button', { name: 'Monter : Lire' }));
    await user.click(screen.getByRole('button', { name: 'Descendre : Lire' }));
    await user.click(screen.getByRole('button', { name: 'Monter : Lire' }));
    await user.click(screen.getByRole('button', { name: 'Valider' }));

    expect(events).toEqual([{ type: 'mission/step-input', payload: { order: ['0', '1'] } }]);
  });

  it('affiche une étape de dialogue', () => {
    setup({ ...terminalRun, step: { type: 'dialogue', id: 'd' } });

    expect(screen.getByText('Écoute ton interlocuteur…')).toBeInTheDocument();
  });
});
