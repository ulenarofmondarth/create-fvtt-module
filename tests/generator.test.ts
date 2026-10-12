import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import * as prettier from 'prettier';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import type { Answers } from '../generator/answers.ts';
import { generate as generateProject } from '../generator/index.ts';
import { listFiles } from '../generator/scaffold.ts';
import { ANSWERS } from './answers.test.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const TEMPLATES = path.join(ROOT, 'templates/module');

let work: string;

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

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'create-fvtt-module-test-'));
});

afterAll(() => {
  fs.rmSync(work, { recursive: true, force: true });
});

describe('the module generator', () => {
  test('writes one file per template, without the template extension', async () => {
    const { destination, result } = await generate('files');
    const expected = listFiles(TEMPLATES)
      .map(file => file.replace(/\.hbs$/, ''))
      .sort();

    expect(listFiles(destination)).toEqual(expected);
    expect([...result.files].sort()).toEqual(expected);
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

    const dirty = listFiles(destination).filter(file => file !== 'pnpm-lock.yaml' && leftovers.test(read(file)));

    expect(dirty).toEqual([]);
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

    expect(unformatted).toEqual([]);
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
