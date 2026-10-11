# Foundry VTT module template

A [plop](https://plopjs.com) generator that creates a complete, working project for a Foundry VTT module (version 14 and
later) from a handful of answers.

The generated project has no module code beyond an entry point that logs on `init`. What it has is the tooling:

- strict TypeScript, bundled by Vite into one ES module, with Svelte 5 ready for UI and the League `fvtt-types`
- Vitest unit tests with typed Foundry mocks and enforced coverage thresholds
- Playwright end-to-end tests against a real, pinned Foundry VTT server in Docker (Chromium, Firefox, WebKit)
- ESLint (strict, type-checked), Prettier, `svelte-check`
- Husky hooks, lint-staged, Commitizen and commitlint enforcing Conventional Commits
- semantic-release, which stamps `module.json`, zips the Foundry package and publishes the GitHub release
- GitHub Actions workflows for CI, end-to-end tests, releases and documentation
- Sphinx documentation (MyST Markdown, furo) built entirely inside Docker
- a Docker Compose development Foundry VTT server with a Vite dev server in front of it

## Requirements

- Node.js 24 or later (the generator and the generated scripts are TypeScript run directly by Node)
- pnpm
- git
- Docker, for the generated project's documentation, development server and end-to-end tests

## Generating a module

```sh
pnpm install
pnpm generate
```

You are asked for:

| Answer             | Used for                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `moduleId`         | The Foundry package ID, bundle name, localization key and container mount point                 |
| `moduleTitle`      | The title in `module.json`, the documentation and the README                                    |
| `description`      | `module.json`, `package.json`, the README and the documentation home page                       |
| `authorName`       | `module.json`, `package.json`, the licence and the documentation                                |
| `authorEmail`      | Optional. The author entry in `module.json`                                                     |
| `authorUrl`        | Optional. The author entry in `module.json`                                                     |
| `authorDiscord`    | Optional. The author entry in `module.json`                                                     |
| `githubOwner`      | Repository, manifest, download and GitHub Pages URLs                                            |
| `repoName`         | The same URLs. Defaults to the module ID                                                        |
| `foundryVersion`   | The exact Foundry VTT build of the development server and the end-to-end tests                  |
| `systemId`         | The game system the end-to-end test world is created with                                       |
| `systemUrl`        | The release `.zip` of that system, pinned for the tests. Known for `dnd5e`, asked for otherwise |
| `restrictToSystem` | Whether `module.json` declares that system as required                                          |
| `destination`      | Where to create the project. Defaults to `../<moduleId>`, next to this repository               |
| `gitInit`          | Whether to run `git init` there                                                                 |
| `install`          | Whether to run `pnpm install` there                                                             |

The generator refuses to write into a directory that already has content unless plop is run with `--force`.

To skip the prompts, give the answers by name. Anything left out is still asked for:

```sh
pnpm generate -- \
  --moduleId arcane-ledger --moduleTitle "Arcane Ledger" --description "Keeps the party accounts." \
  --authorName "A. Scribe" --authorEmail "" --authorUrl "" --authorDiscord "" \
  --githubOwner Scribes-Guild --repoName arcane-ledger \
  --foundryVersion 14.368.0 --systemId dnd5e \
  --systemUrl https://github.com/foundryvtt/dnd5e/releases/download/release-5.3.3/dnd5e-release-5.3.3.zip \
  --restrictToSystem n --destination ../arcane-ledger --gitInit y --install y
```

## After generating

The new project's `docs/developers/setup.md` and `CONTRIBUTING.md` describe the details. In short:

1. Copy `.foundryvtt/secrets.example.json` to `.foundryvtt/secrets.json` and fill it in to run the development server.
2. Create the GitHub repository and add its secrets: `PERSONAL_ACCESS_TOKEN` for releases, and `FOUNDRY_USERNAME`,
   `FOUNDRY_PASSWORD`, `FOUNDRY_LICENSE_KEY` and `FOUNDRY_ADMIN_KEY` for the end-to-end tests.
3. Commit. The commit hooks are already active, so the first commit must be a Conventional Commit with a scope, such
   as `chore(project): scaffold the module`.

Versions start at `0.x`: the release workflow tags the first commit `v0.0.0` on its first run, so the first `feat`
commit pushed to `main` is released as `0.1.0`.

## How the generator works

| Path                    | Purpose                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------- |
| `plopfile.ts`           | The prompts, the Handlebars helpers and the three actions                          |
| `generator/answers.ts`  | Validation of the answers and the values derived from them                         |
| `generator/scaffold.ts` | Writing, formatting, `git init` and `pnpm install`                                 |
| `templates/module/`     | The project that is generated                                                      |
| `tests/`                | Unit tests of the generator                                                        |
| `scripts/smoke.ts`      | Generates a project and runs its typecheck, lint, tests, build and release package |

Files in `templates/module/` ending in `.hbs` are rendered with Handlebars and lose the extension. Every other file is
copied byte for byte, so GitHub Actions workflows and MyST pages can use `{{ }}` freely. After rendering, the generator
formats the project with the project's own Prettier configuration, so the output passes its format check whatever the
length of the names.

When editing templates:

- Use triple braces, `{{{moduleTitle}}}`, so that Handlebars does not HTML-escape the value.
- Inside string literals use the helpers: `{{{json value}}}` for JSON, `{{{ts value}}}` for TypeScript and
  `{{{py value}}}` for Python. They add the quotes and escape the value. `{{{concat a 'b' c}}}` joins values.
- In a `.hbs` file, write a literal `{{` as `\{{`.

### The template lockfile

`templates/module/pnpm-lock.yaml` is copied into every new project, so each one starts with the dependency versions
the template was last tested with. This matters most for `fvtt-types`, which tracks the `main` branch of its
repository: `pnpm-workspace.yaml` has to name the exact commit whose build script is allowed to run, and the lockfile
keeps new projects on that commit.

To move the template to current versions:

1. Delete `templates/module/pnpm-lock.yaml`.
2. Run `pnpm run test:smoke --update-lockfile`.
3. If the install stops with `ERR_PNPM_IGNORED_BUILDS` for `foundry-vtt-types`, copy the package key from the error
   message over the old one in `templates/module/pnpm-workspace.yaml`, and run the command again.

## Checking the generator

```sh
pnpm typecheck
pnpm test               # generates into temporary directories and inspects the result
pnpm run test:smoke     # generates a project, installs it and runs its own checks; slow, uses the network
pnpm run test:smoke --docs   # the same, plus the Docker build of the documentation
```

The smoke test does not run the generated end-to-end tests: they need a Foundry VTT licence.
