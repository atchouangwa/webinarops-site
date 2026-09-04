import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import vercel from '@astrojs/vercel';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.webinarops.io',
  output: 'server',
  adapter: vercel(),
  integrations: [react(), sitemap()],
});
