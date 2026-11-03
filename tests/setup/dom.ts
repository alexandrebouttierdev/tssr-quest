/**
 * Préparation des tests de composants React : ajoute les matchers de jest-dom
 * (`toBeInTheDocument`, `toHaveValue`…) et nettoie le DOM après chaque test.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { MotionGlobalConfig } from 'motion/react';
import { afterEach } from 'vitest';

// happy-dom n'implémente pas toute l'API Web Animations : les animations de Motion sont coupées.
MotionGlobalConfig.skipAnimations = true;

afterEach(() => {
  cleanup();
});
