/**
 * Configuration Vitest : deux projets (logique en Node, interface en happy-dom)
 * et seuils de couverture de docs/09-tests-qualite.md.
 */
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      projects: [
        {
          extends: true,
          test: {
            name: 'logique',
            environment: 'node',
            include: ['src/**/*.test.ts', 'scripts/**/*.test.ts', 'tests/fixtures/**/*.test.ts'],
          },
        },
        {
          extends: true,
          test: {
            name: 'interface',
            environment: 'happy-dom',
            include: ['src/**/*.test.tsx'],
            setupFiles: ['./tests/setup/dom.ts'],
          },
        },
      ],
      coverage: {
        provider: 'v8',
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/**/*.test.*',
          'src/content/generated/**',
          'src/game/scenes/**',
          'src/main.tsx',
          'src/**/index.ts',
          'src/**/*.d.ts',
        ],
        reporter: ['text-summary', 'html', 'json-summary'],
        thresholds: {
          'src/sims/**': { lines: 90, branches: 85, functions: 90 },
          'src/engine/**': { lines: 90, branches: 85, functions: 90 },
          'src/core/**': { lines: 90, branches: 85, functions: 90 },
          'src/content/**': { lines: 85, branches: 80, functions: 85 },
          'src/ui/**': { lines: 70, branches: 60, functions: 70 },
        },
      },
    },
  }),
);
