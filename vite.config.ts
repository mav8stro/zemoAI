import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    base: './',
    plugins: [react()],
    server: {
        port: Number(process.env.PORT) || 5173,
    },
    build: {
        chunkSizeWarningLimit: 4500,
        rollupOptions: {
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) {
                        if (id.includes('three')) return 'vendor-three';
                        if (id.includes('framer-motion')) return 'vendor-motion';
                        if (id.includes('react')) return 'vendor-react';
                    }
                }
            }
        }
    },
    optimizeDeps: {
        exclude: ['kokoro-js', 'phonemizer', '@huggingface/transformers'],
    },
});
