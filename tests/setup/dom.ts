/**
 * Préparation des tests de composants React : ajoute les matchers de jest-dom
 * (`toBeInTheDocument`, `toHaveValue`…) et nettoie le DOM après chaque test.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});
