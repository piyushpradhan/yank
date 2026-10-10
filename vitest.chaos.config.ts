import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Chaos suite: random, so kept out of the default `npm test` run.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.chaos.{ts,tsx}'],
    testTimeout: 180_000,
  },
})
