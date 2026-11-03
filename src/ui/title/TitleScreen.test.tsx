import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TitleScreen } from './TitleScreen';

describe('<TitleScreen>', () => {
  it('propose une nouvelle partie avec prénom et pronoms', async () => {
    const onNewGame = vi.fn();
    render(<TitleScreen hasSave={false} onContinue={vi.fn()} onNewGame={onNewGame} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('TSSR Quest');
    expect(screen.queryByRole('button', { name: /Continuer/ })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Contrôles' })).toHaveTextContent('se déplacer');

    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle partie' }));
    await userEvent.type(screen.getByLabelText('Comment t’appelles-tu ?'), '  Alex ');
    await userEvent.click(screen.getByRole('radio', { name: 'elle' }));
    await userEvent.click(screen.getByRole('button', { name: 'Commencer le stage' }));

    expect(onNewGame).toHaveBeenCalledWith({ name: 'Alex', pronouns: 'elle' });
  });

  it('reprend la sauvegarde et prévient avant de la remplacer', async () => {
    const onContinue = vi.fn();
    render(<TitleScreen hasSave savedName="Sam" onContinue={onContinue} onNewGame={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /Continuer · Sam/ }));
    expect(onContinue).toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Nouvelle partie' }));
    expect(screen.getByText('Ta partie en cours sera remplacée.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Retour' }));
    expect(screen.getByRole('navigation', { name: 'Menu principal' })).toBeInTheDocument();
  });
});
