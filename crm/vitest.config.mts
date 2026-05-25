import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  css: {
    // Prevent Vite from loading postcss.config.mjs (Tailwind v4 string-plugin
    // syntax is valid for Next.js but not for raw Vite / vitest).
    postcss: { plugins: [] },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'lib/**/__tests__/**/*.test.ts', 'app/**/__tests__/**/*.test.ts'],
    // Eval suite is gated by RUN_EVALS — exclude from the default
    // `pnpm test` so commits don't burn OpenAI tokens automatically.
    // Run via `pnpm eval` (which sets RUN_EVALS=1 and removes the
    // exclusion).
    exclude:
      process.env.RUN_EVALS === '1'
        ? ['node_modules', '.next', 'scripts']
        : ['node_modules', '.next', 'scripts', 'tests/evals'],
    globals: false,
  },
});
