import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('./content', () => ({ loadGeneratedContent: () => null }));
// Phaser a besoin d'un vrai canevas : le monde est couvert par les tests E2E.
vi.mock('./GameCanvas', () => ({ GameCanvas: () => null }));

describe('<App>', () => {
  it('explique comment compiler le contenu quand il manque', async () => {
    const { App } = await import('./App');

    render(<App />);

    expect(screen.getByRole('main')).toHaveTextContent('npm run content:build');
  });
});
