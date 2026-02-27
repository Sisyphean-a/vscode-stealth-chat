const esbuild = require('esbuild');
const sveltePlugin = require('esbuild-svelte');
const sveltePreprocess = require('svelte-preprocess');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * @type {import('esbuild').Plugin}
 */
const createProblemMatcherPlugin = (scope) => ({
	name: `esbuild-problem-matcher-${scope}`,

	setup(build) {
		build.onStart(() => {
			console.log(`[watch:${scope}] build started`);
		});
		build.onEnd(result => {
			result.errors.forEach(({ text, location }) => {
				console.error(`✘ [ERROR] ${text}`);
				console.error(`    ${location.file}:${location.line}:${location.column}:`);
			});
			console.log(`[watch:${scope}] build finished`);
		});
	},
});

const extensionConfig = {
	entryPoints: ['src/extension.ts'],
	bundle: true,
	format: 'cjs',
	minify: production,
	sourcemap: !production,
	sourcesContent: false,
	platform: 'node',
	outfile: 'dist/extension.js',
	external: ['vscode'],
	logLevel: 'silent',
	plugins: [createProblemMatcherPlugin('extension')],
};

const webviewConfig = {
	entryPoints: ['src/webview-svelte/main.ts'],
	bundle: true,
	format: 'iife',
	minify: production,
	sourcemap: !production,
	sourcesContent: false,
	platform: 'browser',
	target: ['es2020'],
	outdir: 'dist/webview',
	entryNames: 'main',
	logLevel: 'silent',
	plugins: [
		sveltePlugin({
			preprocess: sveltePreprocess({
				typescript: {
					tsconfigFile: false,
					compilerOptions: {
						verbatimModuleSyntax: true,
						target: 'ES2020',
					},
				},
			}),
			compilerOptions: {
				dev: !production,
				css: 'external',
			},
		}),
		createProblemMatcherPlugin('webview'),
	],
};

async function main() {
	const extensionCtx = await esbuild.context(extensionConfig);
	const webviewCtx = await esbuild.context(webviewConfig);

	if (watch) {
		await Promise.all([extensionCtx.watch(), webviewCtx.watch()]);
	} else {
		await Promise.all([extensionCtx.rebuild(), webviewCtx.rebuild()]);
		await Promise.all([extensionCtx.dispose(), webviewCtx.dispose()]);
	}
}

main().catch(e => {
	console.error(e);
	process.exit(1);
});
