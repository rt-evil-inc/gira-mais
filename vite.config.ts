import { sveltekit } from '@sveltejs/kit/vite';
import { realpathSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5173,
		fs: {
			// Vite checks served files against their real path. When node_modules is a
			// symlink (e.g. a git worktree sharing the main checkout's install), assets
			// like the @fontsource woff files resolve outside the project and get a 403.
			allow: [realpathSync('node_modules')],
		},
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