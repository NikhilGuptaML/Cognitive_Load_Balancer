/* This file configures the Vite development server and a proxy to the local FastAPI backend so the browser can use relative API calls without any cloud services or cross-origin setup beyond localhost. */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
    plugins: [react()],
    server: {
        port: 5173,
        proxy: {
            '/document': 'http://localhost:8000',
            '/session': 'http://localhost:8000',
            '/question': 'http://localhost:8000',
            '/answer': 'http://localhost:8000',
            '/signal': 'http://localhost:8000',
            '/health': 'http://localhost:8000'
        }
    }
});
