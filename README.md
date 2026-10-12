# create-fvtt-module

Creates a complete, working project for a Foundry VTT module (version 14 and later) from a handful of answers.

```sh
pnpm create @mondarth/fvtt-module
```

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

- Node.js 24 or later (the generated project's scripts are TypeScript run directly by Node)
- pnpm
- git
- Docker, for the generated project's documentation, development server and end-to-end tests

## Generating a module

```sh
pnpm create @mondarth/fvtt-module [destination]
# or
npm create @mondarth/fvtt-module [destination]
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
| `destination`      | Where to create the project. Defaults to `./<moduleId>`                                         |
| `gitInit`          | Whether to run `git init` there                                                                 |
| `install`          | Whether to run `pnpm install` there                                                             |

The generator refuses to write into a directory that already has content unless it is run with `--force`.

To skip the prompts, give the answers as options; `--help` lists them all. Anything left out is still asked for,
unless `--yes` is given or there is no terminal, in which case the defaults are used and a missing answer that has no
default is an error:

```sh
pnpm create @mondarth/fvtt-module ./arcane-ledger \
  --module-id arcane-ledger --description "Keeps the party accounts." \
  --author-name "A. Scribe" --github-owner Scribes-Guild \
  --foundry-version 14.368.0 --no-install --yes
```

With `npm create`, put `--` before the options so that npm passes them on.

## Using the generator from another tool

The package is also a library, so a tool can ask the questions its own way and then generate:

```ts
import { generate, questions, type Answers } from "@mondarth/create-fvtt-module";

// `questions` describes every answer: its name, its prompt, its default and its validation.
const answers: Answers = await askYourOwnWay(questions);
const { destination, files } = await generate(answers, { onStep: console.log });
```

`generate` validates the answers before it writes anything and throws an `Error` naming the first invalid one. It
runs `git init` and `pnpm install` in the new project when `answers.gitInit` and `answers.install` are set.

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

| Path                     | Purpose                                                                            |
| ------------------------ | ---------------------------------------------------------------------------------- |
| `generator/index.ts`     | The library entry point: `generate` and the exported types                         |
| `generator/cli.ts`       | The command line: options, prompts, and the call to `generate`                     |
| `generator/questions.ts` | The questions, as data                                                             |
| `generator/answers.ts`   | Validation of the answers and the values derived from them                         |
| `generator/render.ts`    | Handlebars and its helpers                                                         |
| `generator/scaffold.ts`  | Writing, formatting, `git init` and `pnpm install`                                 |
| `templates/module/`      | The project that is generated                                                      |
| `tests/`                 | Unit tests of the generator                                                        |
| `scripts/smoke.ts`       | Packs the generator, generates from the package, and runs the project's own checks |

Files in `templates/module/` ending in `.hbs` are rendered with Handlebars and lose the extension. Every other file is
copied byte for byte, so GitHub Actions workflows and MyST pages can use `{{ }}` freely. After rendering, the generator
formats the project with the project's own Prettier configuration, so the output passes its format check whatever the
length of the names.

When editing templates:

- Use triple braces, `{{{moduleTitle}}}`, so that Handlebars does not HTML-escape the value.
- Inside string literals use the helpers: `{{{json value}}}` for JSON, `{{{ts value}}}` for TypeScript and
  `{{{py value}}}` for Python. They add the quotes and escape the value. `{{{concat a 'b' c}}}` joins values.
- In a `.hbs` file, write a literal `{{` as `\{{`.
- Do not add a file named `.gitignore`, `.npmrc` or `pnpm-lock.yaml`: package managers leave those out of a published
  package. Store it under another name and add the pair to `STORED_AS` in `generator/scaffold.ts`, as is done for
  `_gitignore` and `_pnpm-lock.yaml`.

### The template lockfile

`templates/module/_pnpm-lock.yaml` is copied into every new project as `pnpm-lock.yaml`, so each one starts with the dependency versions
the template was last tested with. This matters most for `fvtt-types`, which tracks the `main` branch of its
repository: `pnpm-workspace.yaml` has to name the exact commit whose build script is allowed to run, and the lockfile
keeps new projects on that commit.

To move the template to current versions:

1. Delete `templates/module/_pnpm-lock.yaml`.
2. Run `pnpm run test:smoke --update-lockfile`.
3. If the install stops with `ERR_PNPM_IGNORED_BUILDS` for `foundry-vtt-types`, copy the package key from the error
   message over the old one in `templates/module/pnpm-workspace.yaml`, and run the command again.

## Working on the generator

```sh
pnpm install
pnpm generate           # runs the command line from source
pnpm typecheck
pnpm test               # generates into temporary directories and inspects the result
pnpm build              # compiles generator/ to dist/, which is what the package ships
pnpm run test:smoke     # packs the package, installs it, generates a project and runs its own checks; slow, uses the network
pnpm run test:smoke --docs   # the same, plus the Docker build of the documentation
```

The smoke test does not run the generated end-to-end tests: they need a Foundry VTT licence.

The sources are TypeScript that Node runs directly, but Node refuses to do that for files under `node_modules`, so the
published package contains the compiled `dist/` and the `templates/` only.

## Releasing

Commits follow [Conventional Commits](https://www.conventionalcommits.org), enforced by a commit hook, with a
mandatory scope. Every push to `main` that passes CI runs semantic-release, which works out the version from the
commits (`fix` → patch, `feat` → minor, `!` or `BREAKING CHANGE:` → major), publishes to npm, writes `CHANGELOG.md`,
commits it with the new version, and creates the GitHub release.

Publishing uses npm [trusted publishing](https://docs.npmjs.com/trusted-publishers): the registry accepts the identity
of `.github/workflows/release.yml` in place of a token. The repository needs one secret, `PERSONAL_ACCESS_TOKEN`, with
which the release commit is pushed to `main`.

## AI Disclosure

Claude Opus 5.5 was used in part for:

- Code generation
- Tool configuration
- Debugging
- Documentation

A human has reviewed all AI material against internal standards.
