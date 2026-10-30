import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
// Build en un solo index.html (abre con doble clic, sin servidor). El mapa base necesita internet.
export default defineConfig({ base: './', plugins: [viteSingleFile()], build: { outDir: 'dist', assetsInlineLimit: 100000000, chunkSizeWarningLimit: 5000 } });
