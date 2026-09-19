import forms from '@tailwindcss/forms';
import theme from 'tailwindcss/defaultTheme';
/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			fontFamily: {
				'sans': ['Inter', ...theme.fontFamily.sans],
				'mono': ['"Roboto Mono"', ...theme.fontFamily.mono],
			},
			colors: {
				'primary': 'var(--color-primary)',
				'background': 'var(--color-background)',
				'background-secondary': 'var(--color-background-secondary)',
				'background-tertiary': 'var(--color-background-tertiary)',
				'label': 'var(--color-label)',
				'info': 'var(--color-info)',
				'warning': 'var(--color-warning)',
			},
			borderRadius: {
				'4xl': '2rem',
			},
			fontSize: {
				'2xs': '0.58rem',
			},
		},
	},
	darkMode: ['class', '[data-theme="dark"]'],
	plugins: [forms],
};