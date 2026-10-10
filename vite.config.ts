import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Vitest lee esta clave en runtime; tipado de Vite no la declara.
  ...({
    test: {
      environment: 'node',
      includeSource: ['src/**/*.{ts,tsx}'],
    },
  } as Record<string, unknown>),
})
