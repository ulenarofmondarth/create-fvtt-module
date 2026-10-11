export default {
  // ESLint also applies Prettier (eslint-plugin-prettier), so these files need no separate format step.
  '*.{ts,mts,js,mjs,svelte}': ['eslint --fix', 'vitest related --run --passWithNoTests'],
  // tsc cannot check single files against the project config, so check the whole project whenever TypeScript is staged.
  '*.{ts,mts,svelte}': () => 'pnpm typecheck',
  '*.{json,css,scss,md,yml,yaml}': 'prettier --write',
};
