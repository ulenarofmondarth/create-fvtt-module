import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

/** Runs commitlint, with the repository's configuration, on one commit message. */
const lint = (message: string): boolean =>
  spawnSync('pnpm', ['exec', 'commitlint'], { input: message, encoding: 'utf8' }).status === 0;

describe('commitlint configuration', () => {
  it('ignores Dependabot version bumps, however long their header', () => {
    expect(lint('build(deps-dev): bump the commit-tooling group across 1 directory with 4 updates')).toBe(true);
    expect(lint('ci(workflows): bump pnpm/action-setup from 6.0.10 to 6.1.0 in /.github/actions/setup')).toBe(true);
  });

  it('still limits the header of other commits to 72 characters', () => {
    expect(lint('build(deps): add a dependency with a header that runs well past the limit')).toBe(false);
  });

  it('still requires a scope', () => {
    expect(lint('build: bump the commit-tooling group')).toBe(false);
  });
});
