/** Dependabot writes long "bump x from y to z" messages; their format is not ours to police. */
const isDependabot = message => /^(?:build|ci)\([\w-]+\): bump /.test(message);

export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [isDependabot],
  plugins: ['commitlint-plugin-tense'],
  rules: {
    'scope-empty': [2, 'never'],
    'header-max-length': [2, 'always', 72],
    // Imperative mood: "add feature", not "added feature" or "adds feature".
    // The tense check is heuristic; add verbs it wrongly rejects to `allowlist`.
    'tense/subject-tense': [
      2,
      'always',
      { allowedTenses: ['present-imperative'], firstOnly: true, allowlist: ['cover'] },
    ],
  },
};
