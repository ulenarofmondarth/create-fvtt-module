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
