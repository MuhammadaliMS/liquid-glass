import { defineConfig, type Plugin } from 'vite';

// The demo site loads the component the way users do (<script src="liquid-glass.js">);
// in dev that script is served straight from the source.
const devComponent: Plugin = {
  name: 'liquid-glass-dev',
  apply: 'serve',
  transformIndexHtml: (html) => html.replace('src="liquid-glass.js"', 'src="/src/index.ts"'),
};

export default defineConfig({
  root: '.',
  plugins: [devComponent],
  server: { open: false },
  build: {
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'liquid-glass.js' },
    outDir: 'dist',
    emptyOutDir: true,
    copyPublicDir: false,
    target: 'es2020',
    minify: 'esbuild',
  },
});
