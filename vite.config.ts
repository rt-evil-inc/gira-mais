import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5173,
		proxy: {
			'/__dev-proxy/emel': {
				target: 'https://login.emel.pt',
				changeOrigin: true,
				rewrite: path => path.replace(/^\/__dev-proxy\/emel/, ''),
			},
			'/__dev-proxy/vaimoo': {
				target: 'https://emel-consumerapp.vaimoo.com',
				changeOrigin: true,
				rewrite: path => path.replace(/^\/__dev-proxy\/vaimoo/, ''),
			},
			'/__dev-proxy/gira-mais': {
				target: 'https://gira-mais.app',
				changeOrigin: true,
				rewrite: path => path.replace(/^\/__dev-proxy\/gira-mais/, ''),
			},
		},
	},
	test: {
		environment: 'happy-dom',
	},
});