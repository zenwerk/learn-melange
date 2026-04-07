import { defineConfig } from 'vite';
import path from 'path';

const melangeOutput = path.resolve(__dirname, '_build/default/src/output');
const melangeNodeModules = path.join(melangeOutput, 'node_modules');

export default defineConfig({
  root: 'ui',
  resolve: {
    alias: {
      'melange-output': melangeOutput,
      'melange.js': path.join(melangeNodeModules, 'melange.js'),
      'melange.__private__.melange_mini_stdlib': path.join(melangeNodeModules, 'melange.__private__.melange_mini_stdlib'),
      'melange': path.join(melangeNodeModules, 'melange'),
    }
  },
  server: {
    fs: {
      allow: ['..']
    }
  },
  build: {
    target: 'esnext',
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'esnext',
    },
  },
});
