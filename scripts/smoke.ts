#!/usr/bin/env node

/**
 * Generate a project into a temporary directory and run the checks its own CI workflow runs.
 *
 * Usage: `node scripts/smoke.ts [--docs] [--keep] [--update-lockfile]`
 *
 * `--docs` also builds the Sphinx documentation (needs Docker); `--keep` leaves the generated project in place;
 * `--update-lockfile` copies the lockfile of the project that just passed back into the templates.
 * This installs the generated project's dependencies from the network, so it is slow and not part of `pnpm test`.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { Answers } from '../generator/answers.ts';
import { generate } from '../generator/index.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const flags = new Set(process.argv.slice(2));

const destination = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'fvtt-module-template-')), 'smoke-module');

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
  destination,
  gitInit: true,
  install: true,
};

/**
 * Run a command in the generated project, failing the smoke test if it fails.
 * @param command - The executable
 * @param args - Its arguments
 */
function run(command: string, ...args: string[]): void {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd: destination, stdio: 'inherit' });
}

await generate(answers, { onStep: console.log });

// The same gates as the generated .github/workflows/ci.yml.
run('pnpm', 'typecheck');
run('pnpm', 'exec', 'eslint', '.', '--max-warnings', '0');
run('pnpm', 'exec', 'prettier', '--check', '**/*.{json,css,scss,md,yml,yaml}');
run('pnpm', 'run', 'test:coverage');
run('pnpm', 'build');
// What semantic-release runs to stamp the version and zip the Foundry package.
run('node', 'scripts/release/package.ts', '1.2.3');
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
  fs.copyFileSync(path.join(destination, 'pnpm-lock.yaml'), path.join(ROOT, 'templates/module/_pnpm-lock.yaml'));
  console.log('\nUpdated templates/module/_pnpm-lock.yaml');
}

if (flags.has('--keep')) {
  console.log(`\nSmoke test passed. The generated project is in ${destination}`);
} else {
  fs.rmSync(path.dirname(destination), { recursive: true, force: true });
  console.log('\nSmoke test passed.');
}
