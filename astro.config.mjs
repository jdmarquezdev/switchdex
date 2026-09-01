import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  site: process.env.SITE_URL || 'https://catalog.example.com',
  trailingSlash: 'always',
  vite: {
    server: {
      proxy: {
        '/api': 'http://127.0.0.1:8787'
      }
    }
  },
  build: {
    format: 'directory'
  }
});
