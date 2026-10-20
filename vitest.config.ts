import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: {
    // Next replaces this marker at build time; Vitest needs a harmless module
    // so server-only units can be exercised in its Node environment.
    alias: {
      'server-only': new URL('./src/test/server-only.ts', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    // Runtime snapshots include React component contracts as well as server units.
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      reporter: ['text', 'html'],
    },
  },
})
