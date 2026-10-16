/**
 * semantic-release configuration.
 *
 * Releases are cut from `main` only; day-to-day work lands on `dev`. Versions follow SemVer from the Conventional
 * Commits history: `fix` → patch, `feat` → minor, and a `!` or `BREAKING CHANGE:` footer → major.
 */
export default {
  branches: ['main'],
  tagFormat: 'v${version}',
  plugins: [
    ['@semantic-release/commit-analyzer', { preset: 'conventionalcommits' }],
    ['@semantic-release/release-notes-generator', { preset: 'conventionalcommits' }],
    '@semantic-release/changelog',
    // Stamps the version into package.json and publishes to npm; `prepack` builds dist/ first.
    // Authentication is npm trusted publishing (OIDC from the release workflow), so there is no token.
    '@semantic-release/npm',
    [
      '@semantic-release/git',
      {
        assets: ['CHANGELOG.md', 'package.json'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    '@semantic-release/github',
    // Hands the version to the later jobs of the release workflow.
    ['@semantic-release/exec', { successCmd: 'echo "version=${nextRelease.version}" >> "$GITHUB_OUTPUT"' }],
  ],
};
