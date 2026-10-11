import path from 'node:path';

import { describe, expect, test } from 'vitest';

import type { Answers } from '../generator/answers.ts';
import {
  defaultSystemUrl,
  resolveAnswers,
  svelteHashId,
  titleFromId,
  validateArchiveUrl,
  validateFoundryVersion,
  validateModuleId,
  validateOptionalUrl,
} from '../generator/answers.ts';

export const ANSWERS: Answers = {
  moduleId: 'arcane-ledger',
  moduleTitle: 'Arcane Ledger',
  description: 'Keeps the party accounts.',
  authorName: 'A. Scribe',
  authorEmail: '',
  authorUrl: '',
  authorDiscord: '',
  githubOwner: 'Scribes-Guild',
  repoName: 'arcane-ledger',
  foundryVersion: '14.368.0',
  systemId: 'dnd5e',
  systemUrl: 'https://example.com/dnd5e.zip',
  restrictToSystem: false,
  destination: 'out',
  gitInit: false,
  install: false,
};

describe('validateModuleId', () => {
  test.each(['a', 'my-module', 'module2', 'a-1-b'])('accepts %s', id => {
    expect(validateModuleId(id)).toBe(true);
  });

  test.each(['', 'My-Module', 'my_module', 'my module', '-module', 'module-', 'my--module', '2module'])(
    'rejects "%s"',
    id => {
      expect(validateModuleId(id)).toBeTypeOf('string');
    },
  );
});

describe('validateFoundryVersion', () => {
  test('accepts an exact build of a supported generation', () => {
    expect(validateFoundryVersion('14.368.0')).toBe(true);
    expect(validateFoundryVersion('15.1.2')).toBe(true);
  });

  test.each(['14', '14.368', 'v14.368.0', 'latest'])('rejects the inexact version "%s"', version => {
    expect(validateFoundryVersion(version)).toBeTypeOf('string');
  });

  test('rejects generations older than the template targets', () => {
    expect(validateFoundryVersion('13.351.0')).toMatch(/14 and later/);
  });
});

describe('URL validators', () => {
  test('an optional URL may be empty or a full URL', () => {
    expect(validateOptionalUrl('')).toBe(true);
    expect(validateOptionalUrl('https://example.com')).toBe(true);
    expect(validateOptionalUrl('example.com')).toBeTypeOf('string');
  });

  test('a system archive must be the URL of a zip', () => {
    expect(validateArchiveUrl('https://example.com/system.zip')).toBe(true);
    expect(validateArchiveUrl('https://example.com/system.json')).toBeTypeOf('string');
    expect(validateArchiveUrl('')).toBeTypeOf('string');
  });
});

describe('derived defaults', () => {
  test('a title is guessed from the module ID', () => {
    expect(titleFromId('arcane-ledger')).toBe('Arcane Ledger');
  });

  test('the Svelte hash ID is short and built from the module ID', () => {
    expect(svelteHashId('arcane-ledger')).toBe('arcl');
    expect(svelteHashId('x')).toBe('x');
    expect(svelteHashId('one-two-three-four-five')).toBe('onett');
  });

  test('only known systems have a default release archive', () => {
    expect(defaultSystemUrl('dnd5e')).toMatch(/^https:.*\.zip$/);
    expect(defaultSystemUrl('some-other-system')).toBeUndefined();
  });
});

describe('resolveAnswers', () => {
  test('adds the values derived from the answers', () => {
    const data = resolveAnswers(ANSWERS, new Date('2031-05-04'));

    expect(data).toMatchObject({
      compatibilityMinimum: '14',
      langKey: 'ARCANE-LEDGER',
      svelteHashId: 'arcl',
      repoUrl: 'https://github.com/Scribes-Guild/arcane-ledger',
      docsUrl: 'https://scribes-guild.github.io/arcane-ledger/',
      year: '2031',
      destination: path.resolve('out'),
    });
  });

  test.each<[keyof Answers, string]>([
    ['moduleId', 'Not An Id'],
    ['moduleTitle', ' '],
    ['description', ''],
    ['authorName', ''],
    ['authorUrl', 'not a url'],
    ['githubOwner', 'has space'],
    ['repoName', ''],
    ['foundryVersion', '13.0.0'],
    ['systemId', 'DnD'],
    ['systemUrl', ''],
    ['destination', ''],
  ])('rejects an invalid %s', (name, value) => {
    expect(() => resolveAnswers({ ...ANSWERS, [name]: value })).toThrow(`Invalid ${name}`);
  });
});
