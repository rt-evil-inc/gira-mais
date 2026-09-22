import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/**
 * Release builds report the bare package.json version. Anything else (local builds,
 * CI builds of PRs and main, the dev server) is tagged with the commit it was built
 * from, e.g. `1.5.0-dev (a9fc393)`, so an installed build can be traced back.
 */
function appVersion() {
	const base = JSON.parse(readFileSync('package.json', 'utf8')).version;
	if (process.env.GIRA_RELEASE === 'true') return base;
	try {
		const git = cmd => execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
		// Builds made straight from the release tag (e.g. F-Droid) are releases too.
		if (git('git tag --points-at HEAD').split('\n').includes(`v${base}`)) return base;
		return `${base}-dev (${git('git rev-parse --short HEAD')})`;
	} catch {
		return `${base}-dev`;
	}
}

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://kit.svelte.dev/docs/integrations#preprocessors
	// for more information about preprocessors
	preprocess: vitePreprocess(),

	kit: {
		// adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
		// If your environment is not supported or you settled on a specific environment, switch out the adapter.
		// See https://kit.svelte.dev/docs/adapters for more information about adapters.
		adapter: adapter(),
		version: {
			name: appVersion(),
		},
	},
};

export default config;