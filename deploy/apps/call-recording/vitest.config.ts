import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

// Unit tests only. They need no running Twenty server.
export default defineConfig({
  plugins: [tsconfigPaths({ projects: ['tsconfig.spec.json'] })],
  test: {
    include: ['src/**/*.spec.ts'],
  },
});
