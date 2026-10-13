#!/usr/bin/env node

/**
 * Pack the generator as it is published, install that package into a temporary directory, generate a project with its
 * command line, and run the checks the generated project's own CI workflow runs.
 *
 * Going through the packed tarball is the point: it is the only check that sees what users get, including whatever a
 * package manager leaves out of the package.
 *
 * Usage: `node scripts/smoke.ts [--javascript] [--docs] [--keep] [--update-lockfile]`
 *
 * `--javascript` generates a JavaScript project rather than a TypeScript one; `--docs` also builds the Sphinx documentation (needs Docker); `--keep` leaves the generated project in place;
 * `--update-lockfile` copies the lockfile of the project that just passed back into the templates.
 * This installs the generated project's dependencies from the network, so it is slow and not part of `pnpm test`.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Answers, Language } from '../generator/answers.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const flags = new Set(process.argv.slice(2));
const language: Language = flags.has('--javascript') ? 'javascript' : 'typescript';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'create-fvtt-module-smoke-'));
const destination = path.join(work, 'smoke-module');

// Awkward on purpose: quotes and an ampersand must survive into JSON, TypeScript, Python and Markdown.
const answers: Answers = {
  moduleId: 'smoke-module',
  moduleTitle: `Tarn's "Smoke" & Mirrors`,
  description: `Checks that the template's output builds & passes its own "gates".`,
  authorName: "Tarn O'Smoke",
  authorEmail: '',
  authorUrl: 'https://example.com',
  authorDiscord: '',
  githubOwner: 'Example-Org',
  repoName: 'smoke-module',
  foundryVersion: '14.368.0',
  systemId: 'dnd5e',
  systemUrl: 'https://github.com/foundryvtt/dnd5e/releases/download/release-5.3.3/dnd5e-release-5.3.3.zip',
  restrictToSystem: true,
  language,
  destination,
  gitInit: true,
  install: true,
};

/**
 * Run a command, failing the smoke test if it fails.
 * @param cwd - The directory to run it in
 * @param command - The executable
 * @param args - Its arguments
 */
function runIn(cwd: string, command: string, ...args: string[]): void {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

/**
 * Run a command in the generated project, failing the smoke test if it fails.
 * @param command - The executable
 * @param args - Its arguments
 */
function run(command: string, ...args: string[]): void {
  runIn(destination, command, ...args);
}

// `npm pack` runs the `prepack` build, so the tarball holds the compiled generator.
runIn(ROOT, 'npm', 'pack', '--pack-destination', work);
const tarball = fs.readdirSync(work).find(file => file.endsWith('.tgz'));
if (tarball === undefined) throw new Error('npm pack produced no tarball');

// Install it as a user's package manager would, with its dependencies, somewhere unrelated to this repository.
const consumer = path.join(work, 'consumer');
fs.mkdirSync(consumer);
fs.writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'consumer', private: true }));
runIn(consumer, 'npm', 'install', '--no-audit', '--no-fund', path.join(work, tarball));

const options = Object.entries(answers).flatMap(([name, value]) => {
  if (name === 'destination') return [];
  const option = name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
  return typeof value === 'boolean' ? [`--${value ? '' : 'no-'}${option}`] : [`--${option}`, value];
});
runIn(consumer, path.join('node_modules', '.bin', 'create-fvtt-module'), destination, '--yes', ...options);

// The same gates as the generated .github/workflows/ci.yml.
if (language === 'typescript') run('pnpm', 'typecheck');
run('pnpm', 'exec', 'eslint', '.', '--max-warnings', '0');
run('pnpm', 'exec', 'prettier', '--check', '**/*.{json,css,scss,md,yml,yaml}');
run('pnpm', 'run', 'test:coverage');
run('pnpm', 'build');
// What semantic-release runs to stamp the version and zip the Foundry package.
run('node', `scripts/release/package.${language === 'typescript' ? 'ts' : 'js'}`, '1.2.3');
run('pnpm', 'exec', 'prettier', '--check', 'module.json');
run('unzip', '-l', 'releases/module-v1.2.3.zip');
if (flags.has('--docs')) {
  run(
    'docker',
    'compose',
    'run',
    '--rm',
    '--user',
    `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    'docs',
    'make',
    'html',
  );
}

if (flags.has('--update-lockfile')) {
  const lockfile = `templates/${language}/_pnpm-lock.yaml`;
  fs.mkdirSync(path.join(ROOT, path.dirname(lockfile)), { recursive: true });
  fs.copyFileSync(path.join(destination, 'pnpm-lock.yaml'), path.join(ROOT, lockfile));
  console.log(`\nUpdated ${lockfile}`);
}

if (flags.has('--keep')) {
  console.log(`\nSmoke test passed. The generated project is in ${destination}`);
} else {
  fs.rmSync(work, { recursive: true, force: true });
  console.log('\nSmoke test passed.');
}
