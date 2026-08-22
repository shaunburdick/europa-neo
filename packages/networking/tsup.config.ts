import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  target: 'es2022',
  // Never inline workspace packages or the ws native module into the
  // bundle — they must resolve from the consumer's node_modules at
  // runtime (plan.md §"Technical Context").
  external: ['ws', '@europa/engine', '@europa/fog'],
});
