const sveltePreprocess = require("svelte-preprocess");

module.exports = {
  preprocess: sveltePreprocess({
    typescript: {
      tsconfigFile: false,
      compilerOptions: {
        verbatimModuleSyntax: true,
        target: "ES2020",
      },
    },
  }),
};
