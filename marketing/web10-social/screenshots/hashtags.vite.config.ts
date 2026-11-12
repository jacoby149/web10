import { mergeConfig } from 'vite';
import path from 'node:path';
import base from './vite.config';

export default mergeConfig(base, {
  plugins: [{ name: 'hashtag-fixture-routes', configureServer(server) {
    server.middlewares.use((request, _response, next) => {
      if (/^\/(tag\/|hashtag-fixture)/.test(request.url || '')) request.url = `/screenshots/hashtags.html${request.url?.includes('?') ? request.url.slice(request.url.indexOf('?')) : ''}`;
      next();
    });
  } }],
  resolve: { alias: [
    { find: /^@\/data\/hashtags$/, replacement: path.resolve(__dirname, 'hashtags-fixture.ts') },
    { find: /^@\/data\/feed$/, replacement: path.resolve(__dirname, 'hashtags-fixture.ts') },
  ] },
  optimizeDeps: { entries: ['screenshots/hashtags.html'] },
});
