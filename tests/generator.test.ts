import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as prettier from 'prettier';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Answers, Language, UiFramework } from '../generator/answers.ts';
import { LANGUAGES, UI_FRAMEWORKS } from '../generator/answers.ts';
import { generate as generateProject } from '../generator/index.ts';
import { listFiles, targetPath } from '../generator/scaffold.ts';
import { ANSWERS } from './answers.test.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const TEMPLATES = path.join(ROOT, 'templates');

/** Where the generator lives; generated projects name it as their provenance. */
const GENERATOR_URL = 'https://github.com/ulenarofmondarth/create-fvtt-module';

let work: string;

/**
 * @param language - The language of a generated project
 * @param uiFramework - Its UI framework
 * @returns The files such a project is made of: from the shared templates, those of its language, and those of its
 *   language and UI framework together
 */
function expectedFiles(language: Language, uiFramework: UiFramework = 'svelte'): string[] {
  const files = ['module', language, `${language}-${uiFramework}`]
    .map(tree => path.join(TEMPLATES, tree))
    .filter(tree => fs.existsSync(tree))
    .flatMap(tree => listFiles(tree).map(source => targetPath(source, language)));
  return [...new Set(files)].sort();
}

/**
 * Run the generator the way a host does once the questions are answered.
 * @param name - Directory name for the project, below the temporary work directory
 * @param overrides - Answers that differ from the defaults used by these tests
 * @returns The project directory, the generator's report and readers for the files written
 */
async function generate(name: string, overrides: Partial<Answers> = {}) {
  const destination = path.join(work, name);
  const result = await generateProject({ ...ANSWERS, ...overrides, destination });

  return {
    destination,
    result,
    read: (file: string) => fs.readFileSync(path.join(destination, file), 'utf8'),
    json: (file: string) =>
      JSON.parse(fs.readFileSync(path.join(destination, file), 'utf8')) as Record<string, unknown>,
  };
}

/**
 * @param destination - A generated project
 * @returns The files in it that its own Prettier configuration would reformat
 */
async function unformattedFiles(destination: string): Promise<string[]> {
  const ignorePath = path.join(destination, '.prettierignore');
  const unformatted: string[] = [];

  for (const file of listFiles(destination)) {
    const filePath = path.join(destination, file);
    const info = await prettier.getFileInfo(filePath, { ignorePath });
    if (info.ignored || !info.inferredParser) continue;

    const options = await prettier.resolveConfig(filePath);
    if (!(await prettier.check(fs.readFileSync(filePath, 'utf8'), { ...options, filepath: filePath }))) {
      unformatted.push(file);
    }
  }

  return unformatted;
}

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'create-fvtt-module-test-'));
});

afterAll(() => {
  fs.rmSync(work, { recursive: true, force: true });
});

describe('the module generator', () => {
  test('writes one file per template, without the template extension', async () => {
    const { destination, result } = await generate('files');
    const expected = expectedFiles('typescript');

    expect(expected).not.toContainEqual(expect.stringMatching(/\.hbs$/));
    expect(listFiles(destination)).toEqual(expected);
    expect([...result.files].sort()).toEqual(expected);
  });

  test('restores the names of the files a published package cannot carry', async () => {
    const { destination, read } = await generate('stored');

    expect(read('.gitignore')).toContain('node_modules/');
    expect(read('pnpm-lock.yaml')).toMatch(/^lockfileVersion:/m);
    expect(listFiles(destination).filter(file => path.basename(file).startsWith('_'))).toEqual([]);
  });

  test('keeps out of the templates the names package managers leave out of a package', () => {
    const dropped = listFiles(TEMPLATES).filter(file =>
      ['.gitignore', '.npmrc', 'pnpm-lock.yaml'].includes(path.basename(file)),
    );

    expect(dropped).toEqual([]);
  });

  test('fills in the manifest from the answers', async () => {
    const { json } = await generate('manifest', {
      authorEmail: 'scribe@example.com',
      authorDiscord: 'scribe',
      restrictToSystem: true,
    });

    expect(json('module.json')).toMatchObject({
      id: 'arcane-ledger',
      title: 'Arcane Ledger',
      version: '0.0.0',
      description: 'Keeps the party accounts.',
      compatibility: { minimum: '14', verified: '14' },
      relationships: { systems: [{ id: 'dnd5e', type: 'system' }] },
      esmodules: ['dist/arcane-ledger.js'],
      authors: [{ name: 'A. Scribe', email: 'scribe@example.com', discord: 'scribe', flags: {} }],
      url: 'https://github.com/Scribes-Guild/arcane-ledger',
      manifest: 'https://github.com/Scribes-Guild/arcane-ledger/releases/latest/download/module.json',
    });
  });

  test('leaves optional author details and the system requirement out when not given', async () => {
    const { json } = await generate('optional');

    expect(json('module.json')).toMatchObject({ relationships: {}, authors: [{ name: 'A. Scribe', flags: {} }] });
  });

  test('uses the module ID wherever the project names itself', async () => {
    const { read, json } = await generate('names');

    expect(json('package.json')).toMatchObject({ name: 'arcane-ledger', author: 'A. Scribe' });
    expect(json('src/lang/en.json')).toEqual({ 'ARCANE-LEDGER': { Title: 'Arcane Ledger' } });
    expect(read('src/module/lib/constants.ts')).toContain("export const MODULE_ID = 'arcane-ledger';");
    expect(read('.foundryvtt/docker-compose.yml')).toContain('target: /data/Data/modules/arcane-ledger');
    expect(read('tests/e2e/compose.yaml')).toContain('../..:/data/Data/modules/arcane-ledger:ro');
    expect(read('vite.config.ts')).toContain("const s_SVELTE_HASH_ID = 'arcl';");
  });

  test('pins the Foundry build everywhere it is named', async () => {
    const { read } = await generate('foundry', { foundryVersion: '14.400.1' });

    expect(read('.foundryvtt/.env')).toBe('VERSION=14.400.1\n');
    expect(read('tests/e2e/compose.yaml')).toContain('image: felddy/foundryvtt:${FOUNDRY_VERSION:-14.400.1}');
    expect(read('.github/workflows/e2e.yml')).toContain('FOUNDRY_VERSION: 14.400.1');
  });

  test('keeps GitHub Actions and MyST expressions intact', async () => {
    const { read } = await generate('expressions');
    const exemplarStyle = /\$\{\{ [^}]+ \}\}/g;

    for (const workflow of ['dev.yml', 'e2e.yml', 'release.yml', 'build-and-deploy-docs.yml']) {
      const generated = read(`.github/workflows/${workflow}`);
      expect(generated, workflow).not.toContain('\\{{');
      expect(generated.match(exemplarStyle)?.length, workflow).toBeGreaterThan(0);
    }
    expect(read('docs/developers/setup.md')).toContain('Start the {{HMR}} development server');
  });

  test('leaves nothing of the exemplar or of Handlebars behind', async () => {
    const { destination, read } = await generate('clean');
    // TyphonJS is credited in the docs as a Svelte library for Foundry; that mention is deliberate.
    const leftovers = /mondarth|ulenar|lib-?wrapper|\{\{\{|\{\{[#/]/i;
    // The AI disclosure links to the generator the project was scaffolded with; that one mention is deliberate too.
    const withoutProvenance = (text: string) => text.replaceAll(GENERATOR_URL, '');

    const dirty = listFiles(destination).filter(
      file => file !== 'pnpm-lock.yaml' && leftovers.test(withoutProvenance(read(file))),
    );

    expect(dirty).toEqual([]);
  });

  test('heads the README with badges for the project’s own repository', async () => {
    const { read } = await generate('badges', { foundryVersion: '15.100.0' });
    const repository = 'https://github.com/Scribes-Guild/arcane-ledger';

    expect(read('README.md')).toContain(
      `[![Dev CI](${repository}/actions/workflows/dev.yml/badge.svg?branch=dev)](${repository}/actions/workflows/dev.yml)`,
    );
    expect(read('README.md')).toContain(
      '(https://codecov.io/gh/Scribes-Guild/arcane-ledger/branch/dev/graph/badge.svg)',
    );
    expect(read('README.md')).toContain(`(${repository}/actions/workflows/release.yml/badge.svg)`);
    expect(read('README.md')).toContain('https://img.shields.io/github/v/release/Scribes-Guild/arcane-ledger');
    expect(read('README.md')).toContain('https://img.shields.io/badge/Foundry%20VTT-v15%2B-ff6400');
    expect(read('README.md')).toContain(
      '(https://img.shields.io/github/license/Scribes-Guild/arcane-ledger)](LICENSE)',
    );
  });

  test('ends the README and the contributing guide with a disclosure scoped to the scaffold', async () => {
    const { read } = await generate('disclosure');

    for (const file of ['README.md', 'CONTRIBUTING.md']) {
      const text = read(file);
      const disclosure = text.slice(text.lastIndexOf('\n## '));

      expect(disclosure, file).toMatch(/^\n## AI Disclosure\n/);
      expect(disclosure, file).toContain(`[create-fvtt-module](${GENERATOR_URL})`);
      expect(disclosure, file).toContain('covers the scaffold only');
    }
  });

  test('drives the Foundry VTT v14 world creation and join screens in the end-to-end setup', async () => {
    const { read } = await generate('e2e-v14');
    const setup = read('tests/e2e/setup/bootstrap.setup.ts');
    const support = read('tests/e2e/support/foundry.ts');

    // v14 creates worlds on its own /create page, names the id field world-id, and launches the world on creation.
    expect(setup).toContain("await page.waitForURL('**/create');");
    expect(setup).toContain('form#world-create');
    expect(setup).toContain('input[name="world-id"]');
    expect(setup).not.toContain('input[name="id"]');
    expect(setup).toMatch(/waitForURL\(\/\\\/\(players\|join\|game\)\//);
    // The join form takes a typed user name rather than offering a select.
    expect(support).toContain('input[name="username"]');
    expect(support).not.toContain('select[name="userid"]');
    // Foundry logs a console error below 1024x768, and the desktop device presets are 1280x720.
    const config = read('tests/e2e/playwright.config.ts');
    expect(config).toContain('const VIEWPORT = { width: 1280, height: 800 };');
    expect(config.match(/viewport: VIEWPORT/g)).toHaveLength(4);
    // Headless Firefox has no WebGL, which Foundry VTT needs; headed on a virtual display, it renders in software.
    expect(config).toMatch(/name: 'firefox',[^}]*headless: false/);
    expect(read('.github/workflows/e2e.yml')).toContain('run: pnpm run test:e2e:xvfb --project=');
  });

  test('gives headed Firefox a virtual display wherever there is no desktop session, not only in CI', async () => {
    const { read, json } = await generate('e2e-xvfb');

    // Over SSH or in a container there is no DISPLAY for Firefox's window. xvfb-run's default screen is 1280x1024 at
    // 8 bits per pixel: barely wider than the viewport, before the browser's frame, and a poor base for WebGL.
    expect(json('package.json')).toMatchObject({
      scripts: {
        'test:e2e:xvfb':
          'xvfb-run --auto-servernum --server-args="-screen 0 1920x1080x24" ' +
          'playwright test --config tests/e2e/playwright.config.ts',
      },
    });
    expect(read('.github/workflows/e2e.yml')).not.toContain('xvfb-run');
    expect(read('tests/e2e/playwright.config.ts')).toContain('pnpm test:e2e:xvfb');
    // xvfb-run needs xauth, which Debian's xvfb package only recommends.
    expect(read('CONTRIBUTING.md')).toContain('pnpm run test:e2e:xvfb');
    expect(read('CONTRIBUTING.md')).toContain('sudo apt-get install xvfb xauth');
    expect(read('docs/developers/prerequisites.md')).toContain('sudo apt-get install xvfb xauth');
  });

  test('writes special characters as valid JSON, TypeScript and Python literals', async () => {
    const title = `Tarn's "Odd" & <Ends>`;
    const { read, json } = await generate('escaping', { moduleTitle: title, authorName: "Tarn O'Odd" });

    expect(json('module.json')).toMatchObject({ title, authors: [{ name: "Tarn O'Odd" }] });
    expect(read('tests/e2e/support/foundry.ts')).toContain(`export const MODULE_TITLE = 'Tarn\\'s "Odd" & <Ends>';`);
    expect(read('docs/conf.py')).toContain(`project = 'Tarn\\'s "Odd" & <Ends>'`);
    expect(read('README.md')).toMatch(/^# Tarn's "Odd" & <Ends>\n/);
  });

  test('generates files that already pass the project’s own Prettier check', async () => {
    const { destination } = await generate('formatted', {
      moduleId: 'a-very-long-module-identifier-that-moves-line-breaks',
      moduleTitle: 'A Very Long Module Title That Moves The Line Breaks Prettier Would Choose',
    });
    expect(await unformattedFiles(destination)).toEqual([]);
  });

  test('keeps the end-to-end tests’ data and Playwright’s output out of the type-checked tests', async () => {
    const { read } = await generate('test-tsconfig');
    // The file has whole-line comments only, which JSON does not allow.
    const tsconfig = JSON.parse(
      read('tsconfig.test.json')
        .split('\n')
        .filter(line => !line.trimStart().startsWith('//'))
        .join('\n'),
    ) as { include: string[]; exclude?: string[] };

    // For typed linting, `tests/**/*` takes in Playwright's report, whose bundled JS declares globals such as `ui`
    // that hide Foundry's.
    expect(tsconfig.include).toContain('tests/**/*');
    expect(tsconfig.exclude).toEqual(
      expect.arrayContaining(['tests/e2e/.data', 'tests/e2e/test-results', 'tests/e2e/playwright-report']),
    );
  });

  test('keeps the git hooks executable', async () => {
    const { destination } = await generate('modes');

    for (const hook of ['commit-msg', 'pre-commit', 'prepare-commit-msg']) {
      expect(fs.statSync(path.join(destination, '.husky', hook)).mode & 0o111, hook).not.toBe(0);
    }
  });

  test('keeps ESLint and Prettier out of the local server, which mounts the project inside its own data', async () => {
    const { destination, read } = await generate('server-ignored');
    // serve:vtt mounts the project at .foundryvtt/data/Data/modules/arcane-ledger, so each tool would find the project
    // again in there, without end.
    const mounted = path.join(destination, '.foundryvtt/data/Data/modules/arcane-ledger/src/index.ts');
    fs.mkdirSync(path.dirname(mounted), { recursive: true });
    fs.writeFileSync(mounted, 'export {};\n');

    const info = await prettier.getFileInfo(mounted, { ignorePath: path.join(destination, '.prettierignore') });
    expect(info.ignored).toBe(true);
    expect(read('eslint.config.mjs')).toMatch(/ignores: \[[^\]]*'\.foundryvtt\/'/);
  });

  // setsid detaches the hook from any controlling terminal, as an IDE, a script or an agent commits.
  test.skipIf(process.platform !== 'linux')(
    'lets commits made without a terminal through prepare-commit-msg',
    async () => {
      const { destination } = await generate('headless-commit');
      const message = path.join(destination, '.git-commit-message');
      fs.writeFileSync(message, 'fix(core): mend a thing\n');

      // Husky runs hooks with `sh -e`; `git commit -m` passes the message file and "message" as the source.
      expect(() =>
        execFileSync('setsid', ['--wait', 'sh', '-e', '.husky/prepare-commit-msg', message, 'message'], {
          cwd: destination,
          stdio: ['ignore', 'pipe', 'pipe'],
        }),
      ).not.toThrow();
      expect(fs.readFileSync(message, 'utf8')).toBe('fix(core): mend a thing\n');
    },
  );

  test('creates the directories Docker mounts or writes into, so that they belong to the user rather than root', async () => {
    const { destination, read, json } = await generate('data-directory');
    // The development server's and the end-to-end server's data directories, down to the point where each compose
    // file mounts the project as a module. Running as their owner, Foundry VTT makes the rest, such as its cache.
    const directories = ['.foundryvtt/data/Data/modules/arcane-ledger', 'tests/e2e/.data/Data/modules/arcane-ledger'];

    expect(read('.foundryvtt/docker-compose.yml')).toContain('source: ./data');
    expect(read('.foundryvtt/docker-compose.yml')).toContain('target: /data/Data/modules/arcane-ledger');
    expect(read('tests/e2e/compose.yaml')).toContain('./.data:/data');
    for (const relative of directories) {
      const directory = path.join(destination, relative);
      expect(fs.statSync(directory).isDirectory(), relative).toBe(true);
      expect(fs.readdirSync(directory), relative).toEqual([]);
      for (let parent = directory; parent !== destination; parent = path.dirname(parent)) {
        expect(fs.statSync(parent).uid, parent).toBe(process.getuid?.());
      }
    }
    expect(fs.existsSync(path.join(destination, '.foundryvtt/data/container_cache'))).toBe(false);
    expect(fs.existsSync(path.join(destination, 'tests/e2e/.data/container_cache'))).toBe(false);
    expect(read('.gitignore')).toContain('.foundryvtt/data/');
    expect(read('.gitignore')).toContain('tests/e2e/.data/');
    // The directories are not committed, so a clone, and CI, has to make them before Docker does. The server then runs
    // as the user who owns them; the image ignores FOUNDRY_UID and FOUNDRY_GID. A hung server is not reused.
    expect(json('package.json')).toMatchObject({
      scripts: {
        'serve:vtt':
          'cd .foundryvtt && mkdir -p data/Data/modules/arcane-ledger && ' +
          'HOST_UID=$(id -u) HOST_GID=$(id -g) docker compose up -d',
        'e2e:server':
          'mkdir -p tests/e2e/.data/Data/modules/arcane-ledger && ' +
          'HOST_UID=$(id -u) HOST_GID=$(id -g) docker compose -f tests/e2e/compose.yaml up --detach --wait --force-recreate',
      },
    });
    for (const compose of ['.foundryvtt/docker-compose.yml', 'tests/e2e/compose.yaml']) {
      expect(read(compose), compose).toContain('user: ${HOST_UID:-1000}:${HOST_GID:-1000}');
      expect(read(compose), compose).not.toContain('- FOUNDRY_UID=');
    }
    expect(read('.github/workflows/e2e.yml')).toContain('pnpm run e2e:server --wait-timeout 300');
    expect(read('.github/workflows/e2e.yml')).not.toContain('docker compose -f tests/e2e/compose.yaml up');
    expect(read('.github/workflows/e2e.yml')).not.toContain('FOUNDRY_UID');
  });

  test('develops on dev and releases from main, as the release App', async () => {
    const { read } = await generate('workflow');
    const dev = read('.github/workflows/dev.yml');
    const release = read('.github/workflows/release.yml');

    expect(dev).toMatch(/push:\n\s+branches:\n\s+- dev\n/);
    expect(dev).toMatch(/pull_request:\n\s+branches:\n\s+- dev\n\s+- main\n/);
    expect(dev).toContain('codecov/codecov-action@');
    expect(release).toMatch(/push:\n\s+branches:\n\s+- main\n/);
    expect(release).toContain('uses: ./.github/workflows/dev.yml');
    expect(release).toContain('client-id: ${{ vars.RELEASE_APP_CLIENT_ID }}');
    expect(release).toContain('git push origin HEAD:dev');
    expect(read('release.config.js')).toContain(
      `successCmd: 'echo "version=\${nextRelease.version}" >> "$GITHUB_OUTPUT"'`,
    );
    expect(read('.github/workflows/e2e.yml')).toContain('name: E2E passed');
    expect(read('.github/dependabot.yml').match(/target-branch: dev/g)).toHaveLength(4);
    expect(read('.github/dependabot.yml')).toMatch(/dependency-name: conventional-changelog-conventionalcommits/);
    expect(read('.commitlintrc.mjs')).toContain('ignores: [isDependabot]');
    expect(read('codecov.yml')).toContain('carryforward: true');
  });

  test('no longer asks for a personal access token', async () => {
    const { destination, read } = await generate('no-pat');

    const mentions = listFiles(destination).filter(
      file => file !== 'pnpm-lock.yaml' && /PERSONAL_ACCESS_TOKEN/.test(read(file)),
    );

    expect(mentions).toEqual([]);
  });

  test('keeps the Vitest coverage provider on the same major version as Vitest', async () => {
    const { json } = await generate('vitest');
    const { devDependencies } = json('package.json') as { devDependencies: Record<string, string> };
    const major = (range: string | undefined) => /\d+/.exec(range ?? '')?.[0];

    expect(major(devDependencies.vitest)).toBe('5');
    expect(major(devDependencies['@vitest/coverage-v8'])).toBe(major(devDependencies.vitest));
  });

  test('documents the workflow and how to set GitHub up for it', async () => {
    const { read } = await generate('workflow-docs');

    expect(read('docs/index.md')).toMatch(/developers\/workflow\.md\ndevelopers\/github-setup\.md\n/);
    expect(read('docs/developers/github-setup.md')).toContain('`RELEASE_APP_CLIENT_ID`');
    expect(read('docs/developers/github-setup.md')).toContain(
      'git remote add origin https://github.com/Scribes-Guild/arcane-ledger.git',
    );
    expect(read('docs/developers/workflow.md')).toContain(
      'https://github.com/Scribes-Guild/arcane-ledger/releases/latest/download/module.json',
    );
    expect(read('docs/developers/setup.md')).toContain('[](github-setup.md)');
    expect(read('CONTRIBUTING.md')).toContain('Open a pull request against **`dev`**');
  });

  test('refuses to write into a directory that already has content', async () => {
    fs.mkdirSync(path.join(work, 'occupied'));
    fs.writeFileSync(path.join(work, 'occupied/keep.txt'), 'precious');

    await expect(generate('occupied')).rejects.toThrow(/is not empty/);
    expect(fs.readdirSync(path.join(work, 'occupied'))).toEqual(['keep.txt']);
  });

  test('rejects invalid answers before writing anything', async () => {
    await expect(generate('invalid', { moduleId: 'Not Valid' })).rejects.toThrow(/Invalid moduleId/);
    expect(fs.existsSync(path.join(work, 'invalid'))).toBe(false);
  });

  test('can initialise a git repository on main', async () => {
    const { destination } = await generate('git', { gitInit: true });

    const branch = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd: destination, encoding: 'utf8' });
    expect(branch.trim()).toBe('main');
  });
});

describe('a JavaScript project', () => {
  /** Anything that names TypeScript, its tooling, or a file that would be TypeScript. */
  const TYPESCRIPT = /typescript|tsconfig|fvtt-types|typecheck|svelte-check|\btsc\b|\.ts\b/i;

  test('has the same files as a TypeScript one, in JavaScript, less the TypeScript configuration', async () => {
    const { destination, result } = await generate('js-files', { language: 'javascript' });
    const expected = expectedFiles('javascript');
    const written = listFiles(destination);

    expect(written).toEqual(expected);
    expect([...result.files].sort()).toEqual(expected);
    expect(written.filter(file => /\.ts$|tsconfig/.test(file))).toEqual([]);
    expect(written).toEqual(expect.arrayContaining(['src/index.js', 'vite.config.js', 'scripts/release/package.js']));
    // Every source file of the TypeScript project is there, under its JavaScript name.
    expect(written).toEqual(
      expectedFiles('typescript')
        .filter(file => !/\.d\.ts$|tsconfig/.test(file))
        .map(file => file.replace(/\.ts$/, '.js')),
    );
  });

  test('is JavaScript that Node can parse', async () => {
    const { destination } = await generate('js-syntax', { language: 'javascript' });
    const scripts = listFiles(destination).filter(file => /\.m?js$/.test(file));

    expect(scripts.length).toBeGreaterThan(10);
    for (const script of scripts) {
      expect(
        () => execFileSync('node', ['--check', script], { cwd: destination, stdio: 'pipe' }),
        script,
      ).not.toThrow();
    }
  });

  test('depends on neither TypeScript nor the Foundry types', async () => {
    const { json, read } = await generate('js-dependencies', { language: 'javascript' });
    const manifest = json('package.json') as { scripts: Record<string, string>; devDependencies: object };

    expect(
      Object.keys(manifest.devDependencies).filter(name => TYPESCRIPT.test(name) || /^@types\//.test(name)),
    ).toEqual([]);
    expect(manifest.devDependencies).not.toHaveProperty('unplugin-dts');
    expect(manifest).not.toHaveProperty('types');
    expect(manifest.scripts).not.toHaveProperty('typecheck');
    expect(manifest.scripts['test']).toBe('vitest --run');
    expect(read('pnpm-workspace.yaml')).not.toContain('foundry-vtt-types');
  });

  test('says nothing of TypeScript, in its documentation or anywhere else', async () => {
    const { destination, read } = await generate('js-clean', { language: 'javascript' });

    const mentions = listFiles(destination).filter(file => file !== 'pnpm-lock.yaml' && TYPESCRIPT.test(read(file)));

    expect(mentions).toEqual([]);
  });

  test('names its JavaScript files wherever it refers to them', async () => {
    const { read, json } = await generate('js-names', { language: 'javascript' });

    expect(json('package.json')).toMatchObject({
      scripts: { 'e2e:packages': 'node scripts/e2e/install-packages.js' },
    });
    expect(read('release.config.js')).toContain('node scripts/release/package.js ${nextRelease.version}');
    expect(read('vite.config.js')).toContain("entry: './index.js'");
    expect(read('CONTRIBUTING.md')).toContain('`scripts/release/package.js` stamps the version');
    expect(read('docs/developers/setup.md')).toContain('`DEFAULTS` at the top of `vite.config.js`');
    expect(read('.github/workflows/dev.yml')).not.toMatch(/^ {2}(typecheck|svelte-check):/m);
  });

  test('passes its own Prettier check', async () => {
    const { destination } = await generate('js-formatted', { language: 'javascript' });

    expect(await unformattedFiles(destination)).toEqual([]);
  });
});

/** Anything that names Svelte, its tooling, or a library built on it. */
const SVELTE = /svelte|sapper|typhon|\bTRL\b/i;
/** Anything that names Lit or what it is for. */
const LIT = /\blit\b|web components?|custom elements?|decorators?/i;

/** What a project must not mention, by the UI framework it was generated for. */
const FOREIGN: Record<UiFramework, RegExp[]> = { svelte: [LIT], lit: [SVELTE], none: [SVELTE, LIT] };

describe.each(LANGUAGES.flatMap(language => UI_FRAMEWORKS.map(uiFramework => ({ language, uiFramework }))))(
  'a $language project with the UI framework $uiFramework',
  answers => {
    const { language, uiFramework } = answers;
    const name = `${language}-${uiFramework}`;
    const mentionsForeign = (text: string) => FOREIGN[uiFramework].some(pattern => pattern.test(text));

    test('has the same files as any other project in its language', async () => {
      const { destination, result } = await generate(`${name}-files`, answers);
      const expected = expectedFiles(language, uiFramework);

      expect(listFiles(destination)).toEqual(expected);
      expect([...result.files].sort()).toEqual(expected);
      expect(expected).toEqual(expectedFiles(language, 'svelte'));
    });

    test('uses Vite 8 options, not the esbuild and Rollup ones it deprecates', async () => {
      const { read } = await generate(`${name}-vite`, answers);
      const config = read(`vite.config.${language === 'typescript' ? 'ts' : 'js'}`);

      // Vite 8 bundles with Rolldown and transforms with Oxc instead of esbuild, and warns that its native config
      // loader will not support __dirname.
      expect(config).toContain("oxc: {\n      target: 'es2022',\n    },");
      expect(config).toContain("minify: s_COMPRESS ? 'oxc' : false,");
      expect(config).toContain('rolldownOptions: {');
      expect(config).not.toMatch(/esbuild|rollupOptions|optimizeDeps|__dirname/);
    });

    test('depends on nothing of the frameworks it was not set up for', async () => {
      const { json, read } = await generate(`${name}-dependencies`, answers);
      const manifest = json('package.json') as { scripts: Record<string, string>; devDependencies: object };

      expect(Object.keys(manifest.devDependencies).filter(mentionsForeign)).toEqual([]);
      expect(Object.keys(manifest.scripts).filter(mentionsForeign)).toEqual([]);
      expect(mentionsForeign(read('pnpm-workspace.yaml'))).toBe(false);
    });

    test('says nothing of them either, in its documentation or anywhere else', async () => {
      const { destination, read } = await generate(`${name}-clean`, answers);

      const mentions = listFiles(destination).filter(file => file !== 'pnpm-lock.yaml' && mentionsForeign(read(file)));

      expect(mentions).toEqual([]);
    });

    test('keeps the rest of its documentation, MyST expressions included', async () => {
      const { read } = await generate(`${name}-docs`, answers);

      expect(read('docs/developers/why.md')).toContain('It provides nice tools (like an {{HMR}} development server)');
      expect(read('docs/developers/why.md')).toContain('## ... document with Sphinx?');
    });

    test('requires every Dev CI job to pass before CI passed does', async () => {
      const { read } = await generate(`${name}-ci-passed`, answers);
      const dev = read('.github/workflows/dev.yml');
      const jobs = [...dev.slice(dev.indexOf('\njobs:')).matchAll(/^ {2}([\w-]+):$/gm)].map(match => match[1]);
      const needs = /^ {4}needs: \[(.*)\]$/m.exec(dev)?.[1]?.split(', ');

      expect(jobs.at(-1)).toBe('ci-passed');
      expect(needs).toEqual(jobs.slice(0, -1));
    });

    test('passes its own Prettier check', async () => {
      const { destination } = await generate(`${name}-formatted`, answers);

      expect(await unformattedFiles(destination)).toEqual([]);
    });
  },
);

describe('a project with Svelte', () => {
  test('explains the choice, MyST expressions intact', async () => {
    const { read } = await generate('svelte-docs');

    expect(read('docs/developers/why.md')).toContain('{program}`Svelte` is ({{IMHO}}) a more powerful');
  });

  test.each(LANGUAGES)('sets Svelte up in the build and the lint rules of a %s project', async language => {
    const { read, json } = await generate(`svelte-${language}`, { language });

    expect(json('package.json')).toMatchObject({ devDependencies: { svelte: expect.any(String) as string } });
    expect(read(`vite.config.${language === 'typescript' ? 'ts' : 'js'}`)).toContain('preprocess: sveltePreprocess()');
    expect(read('eslint.config.mjs')).toContain('svelte.configs.recommended');
  });

  test('moves Vite and its Svelte plugin together, since each plugin major supports one Vite major', async () => {
    const { read, json } = await generate('svelte-vite');

    // vite-plugin-svelte 7 needs Vite 8; vite-plugin-svelte 5 supports only Vite 6.
    expect(json('package.json')).toMatchObject({
      devDependencies: {
        vite: expect.stringMatching(/^\^8\./),
        '@sveltejs/vite-plugin-svelte': expect.stringMatching(/^\^7\./),
      },
    });
    expect(read('.github/dependabot.yml')).toMatch(
      / {6}vite:\n {8}patterns:\n {10}- vite\n {10}- (['"])@sveltejs\/vite-plugin-svelte\1\n/,
    );
  });
});

describe('a project with Lit', () => {
  test('explains the choice and how to name custom elements', async () => {
    const { read } = await generate('lit-docs', { uiFramework: 'lit' });

    expect(read('docs/developers/why.md')).toContain('## ... all the `lit` stuff?');
    expect(read('docs/developers/why.md')).toContain('`arcane-ledger-panel`');
  });

  test.each(LANGUAGES)(
    'sets Lit up in the dependencies, the lint rules and the coverage of a %s project',
    async language => {
      const { read, json } = await generate(`lit-${language}`, { language, uiFramework: 'lit' });
      const ext = language === 'typescript' ? 'ts' : 'js';

      expect(json('package.json')).toMatchObject({
        devDependencies: { lit: expect.any(String) as string, 'eslint-plugin-lit': expect.any(String) as string },
      });
      expect(read('eslint.config.mjs')).toContain("lit['flat/recommended']");
      expect(read(`vite.config.${ext}`)).toContain(`'component/**/*.${ext}'`);
    },
  );

  test.each(LANGUAGES)(
    'lets the entry-point test of a %s project load components that define custom elements more than once',
    async language => {
      const { read } = await generate(`lit-entry-test-${language}`, { language, uiFramework: 'lit' });
      const entryTest = read(`tests/unit/index.test.${language === 'typescript' ? 'ts' : 'js'}`);

      expect(entryTest).toContain("vi.spyOn(customElements, 'define')");
      expect(entryTest).toContain(
        'if (!customElements.get(tagName)) define(tagName, elementClass, definitionOptions);',
      );
    },
  );

  test('enables decorators the way Lit recommends, in TypeScript', async () => {
    const { json, read } = await generate('lit-decorators', { uiFramework: 'lit' });

    expect(json('tsconfig.json')).toMatchObject({
      compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false },
    });
    expect(read('docs/developers/why.md')).toContain('`tsconfig.json` enables decorators');
  });

  test('points to static properties rather than decorators, in JavaScript', async () => {
    const { read } = await generate('lit-static', { language: 'javascript', uiFramework: 'lit' });

    expect(read('docs/developers/why.md')).toContain('`static properties`');
  });
});
