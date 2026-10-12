export default {
  '*.{ts,mts,js,mjs,json,md,yml,yaml}': 'prettier --write',
  // tsc cannot check single files against the project config, so check the whole project whenever TypeScript is staged.
  '*.ts': [() => 'pnpm typecheck', 'vitest related --run --passWithNoTests'],
};
