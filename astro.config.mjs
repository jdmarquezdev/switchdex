import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  site: process.env.SITE_URL || 'https://catalog.example.com',
  trailingSlash: 'never',
  vite: {
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:8787'
      }
    }
  },
  build: { format: 'directory' }
});
