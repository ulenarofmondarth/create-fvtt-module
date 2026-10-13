import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';

import { main, optionName, parseCommandLine, usage } from '../generator/cli.ts';
import { questions } from '../generator/questions.ts';

let work: string;

beforeAll(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), 'create-fvtt-module-cli-test-'));
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(work, { recursive: true, force: true });
});

/** The answers that have no default, as command-line options. */
const REQUIRED = [
  '--module-id',
  'arcane-ledger',
  '--description',
  'Keeps the party accounts.',
  '--github-owner',
  'Scribes-Guild',
];

describe('the command line', () => {
  test('names its options after the answers, in kebab case', () => {
    expect(optionName('moduleId')).toBe('module-id');
    expect(optionName('install')).toBe('install');
  });

  test('offers an option for every question', () => {
    const text = usage();

    for (const question of questions) expect(text).toContain(`${optionName(question.name)} `);
  });

  test('reads answers, negated confirmations and the destination', () => {
    const { flags, destination } = parseCommandLine(['out', '--module-id', 'a', '--no-install', '--git-init', '-y']);

    expect(destination).toBe('out');
    expect(flags).toMatchObject({ 'module-id': 'a', install: false, 'git-init': true, yes: true });
  });

  test('rejects options it does not know and a second positional argument', () => {
    expect(() => parseCommandLine(['--nonsense'])).toThrow();
    expect(() => parseCommandLine(['one', 'two'])).toThrow(/Unexpected argument "two"/);
  });

  test('generates without asking, using the defaults for what was not given', async () => {
    const destination = path.join(work, 'defaults');

    await main([destination, ...REQUIRED, '--author-name', 'A. Scribe', '--yes', '--no-git-init', '--no-install']);

    const manifest = JSON.parse(fs.readFileSync(path.join(destination, 'module.json'), 'utf8')) as Record<
      string,
      unknown
    >;
    expect(manifest).toMatchObject({
      id: 'arcane-ledger',
      title: 'Arcane Ledger',
      url: 'https://github.com/Scribes-Guild/arcane-ledger',
      authors: [{ name: 'A. Scribe', flags: {} }],
    });
    expect(fs.existsSync(path.join(destination, 'node_modules'))).toBe(false);
  });

  test('generates TypeScript unless told otherwise', async () => {
    const destination = path.join(work, 'default-language');

    await main([destination, ...REQUIRED, '--author-name', 'A. Scribe', '--yes', '--no-git-init', '--no-install']);

    expect(fs.existsSync(path.join(destination, 'src/index.ts'))).toBe(true);
    expect(fs.existsSync(path.join(destination, 'tsconfig.json'))).toBe(true);
  });

  test('generates JavaScript when asked to', async () => {
    const destination = path.join(work, 'javascript');

    await main([
      destination,
      ...REQUIRED,
      '--author-name',
      'A. Scribe',
      '--language',
      'javascript',
      '--yes',
      '--no-git-init',
      '--no-install',
    ]);

    expect(fs.existsSync(path.join(destination, 'src/index.js'))).toBe(true);
    expect(fs.existsSync(path.join(destination, 'src/index.ts'))).toBe(false);
  });

  test('rejects a language it does not know, naming the ones it does', async () => {
    await expect(
      main([...REQUIRED, '--author-name', 'A. Scribe', '--language', 'coffeescript', '--yes']),
    ).rejects.toThrow('Invalid --language "coffeescript": Choose one of: typescript, javascript');
  });

  test('sets the project up for Svelte unless told otherwise', async () => {
    const destination = path.join(work, 'default-ui-framework');

    await main([destination, ...REQUIRED, '--author-name', 'A. Scribe', '--yes', '--no-git-init', '--no-install']);

    expect(fs.readFileSync(path.join(destination, 'package.json'), 'utf8')).toContain('"svelte"');
  });

  test('leaves Svelte out when asked for no UI framework', async () => {
    const destination = path.join(work, 'no-ui-framework');

    await main([
      destination,
      ...REQUIRED,
      '--author-name',
      'A. Scribe',
      '--ui-framework',
      'none',
      '--yes',
      '--no-git-init',
      '--no-install',
    ]);

    expect(fs.readFileSync(path.join(destination, 'package.json'), 'utf8')).not.toContain('svelte');
  });

  test('sets the project up for Lit when asked to', async () => {
    const destination = path.join(work, 'lit');

    await main([
      destination,
      ...REQUIRED,
      '--author-name',
      'A. Scribe',
      '--ui-framework',
      'lit',
      '--yes',
      '--no-git-init',
      '--no-install',
    ]);

    expect(fs.readFileSync(path.join(destination, 'package.json'), 'utf8')).toContain('"lit"');
  });

  test('rejects a UI framework it does not know, naming the ones it does', async () => {
    await expect(main([...REQUIRED, '--author-name', 'A. Scribe', '--ui-framework', 'react', '--yes'])).rejects.toThrow(
      'Invalid --ui-framework "react": Choose one of: svelte, lit, none',
    );
  });

  test('lists the UI frameworks in the usage text', () => {
    expect(usage()).toMatch(/--ui-framework\s+.*\(svelte, lit or none\)/);
  });

  test('lists the languages in the usage text', () => {
    expect(usage()).toMatch(/--language\s+.*\(typescript or javascript\)/);
  });

  test('says which answer is missing when it may not ask', async () => {
    const destination = path.join(work, 'missing');

    await expect(main([destination, '--module-id', 'arcane-ledger', '--yes'])).rejects.toThrow(
      '--description is required',
    );
    expect(fs.existsSync(destination)).toBe(false);
  });

  test('rejects an invalid answer by the name of its option', async () => {
    await expect(main(['--module-id', 'Not Valid', '--yes'])).rejects.toThrow(/Invalid --module-id "Not Valid"/);
  });
});
