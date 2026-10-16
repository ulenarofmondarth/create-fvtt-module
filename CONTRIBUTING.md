# Contributing

## Setting up

You need Node.js 24 or later, pnpm, git and, for the full smoke test, Docker.

```sh
git switch dev
pnpm install     # also installs the git hooks
```

The README describes [how the generator works](README.md#how-the-generator-works) and
[the commands for working on it](README.md#working-on-the-generator).

## Workflow

1. Create a short-lived branch from **`dev`**, named for the change: `feat/...`, `fix/...`, `docs/...`.
2. Write a failing test first, then the change. A bug fix starts with a test that reproduces the bug.
3. Run the checks (below).
4. Commit using Conventional Commits.
5. Open a pull request against **`dev`**. The **CI passed** check must be green before it is merged.

`main` only receives merges from `dev`, with a merge commit (never a squash, so semantic-release sees every commit);
each merge may produce a release. Releases are fully automated: never edit the version number or `CHANGELOG.md` by
hand.

## Before opening a pull request

```sh
pnpm typecheck
pnpm run format:check
pnpm test:coverage                      # the tests, with the coverage thresholds
pnpm run test:smoke                     # slow, uses the network; run it when the templates or the packaging change
pnpm run test:smoke --javascript        # the same for a JavaScript project; run it when the templates change
pnpm run test:smoke --lit               # and for a project set up for Lit, with and without --javascript
pnpm run test:smoke --no-ui-framework   # and for one without a UI framework, likewise
```

Keep pull requests small and focused, with tests for what they change. A bug fix starts with a test that fails
because of the bug. The coverage thresholds in `vitest.config.ts` sit just below the measured level: raise them as
tests are added, never lower them. CI reports coverage to Codecov.

## Commits

Commits follow [Conventional Commits](https://www.conventionalcommits.org), and the release version is worked out from
them, so the type matters: `fix` releases a patch, `feat` a minor version, and a `!` or a `BREAKING CHANGE:` footer a
major one. The commit hooks enforce:

- a type and a scope, as in `fix(templates): …`
- a subject in the imperative mood ("add", not "added" or "adds")
- a header of at most 72 characters

In a terminal, `git commit` opens the Commitizen prompt, which builds a valid message for you. The pre-commit hook
formats the staged files, typechecks the project and runs the tests related to what is staged.

### Bypassing the hooks

Do not, except in an emergency. If you must, commit with `git commit --no-verify`, and as soon as the emergency is over
run `git commit --amend` without `--no-verify`, so that the hooks check the commit before it is pushed.

## AI Disclosure

Claude Opus 5.5 was used in part for:

- Code generation
- Tool configuration
- Debugging
- Documentation

A human has reviewed all AI material against internal standards.
