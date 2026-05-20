import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';

// https://astro.build/config
export default defineConfig({
  site: 'https://recall.vercel.app',
  build: {
    inlineStylesheets: 'always',
  },
  integrations: [icon()],
  vite: {
    plugins: [tailwindcss()],
  },
});
