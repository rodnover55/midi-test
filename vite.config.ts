import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Относительные пути: собранную страницу можно положить в любой каталог сайта.
  base: './',
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
  // Отдельный кэш позволяет запускать несколько серверов разработки сразу.
  cacheDir: process.env.MIDI_TEST_VITE_CACHE ?? 'node_modules/.vite',
  test: {
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
