import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
export default defineConfig({ base: './', plugins: [viteSingleFile()], build: { outDir: 'dist-poster', rollupOptions: { input: 'poster.html' }, assetsInlineLimit: 100000000 } });
