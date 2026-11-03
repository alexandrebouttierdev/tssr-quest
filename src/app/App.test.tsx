import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('<App>', () => {
  it('affiche la racine du jeu', () => {
    render(<App />);

    expect(screen.getByRole('main', { name: 'TSSR Quest' })).toBeInTheDocument();
  });
});
