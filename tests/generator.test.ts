import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as prettier from 'prettier';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Answers, Language } from '../generator/answers.ts';
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
 * @returns The files such a project is made of, from the shared templates and those of its language
 */
function expectedFiles(language: Language): string[] {
  const files = ['module', language].flatMap(tree =>
    listFiles(path.join(TEMPLATES, tree)).map(source => targetPath(source, language)),
  );
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

    for (const workflow of ['ci.yml', 'e2e.yml', 'release.yml', 'build-and-deploy-docs.yml']) {
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

  test('keeps the git hooks executable', async () => {
    const { destination } = await generate('modes');

    for (const hook of ['commit-msg', 'pre-commit', 'prepare-commit-msg']) {
      expect(fs.statSync(path.join(destination, '.husky', hook)).mode & 0o111, hook).not.toBe(0);
    }
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
    expect(read('.github/workflows/ci.yml')).not.toMatch(/^ {2}(typecheck|svelte-check):/m);
  });

  test('passes its own Prettier check', async () => {
    const { destination } = await generate('js-formatted', { language: 'javascript' });

    expect(await unformattedFiles(destination)).toEqual([]);
  });
});
