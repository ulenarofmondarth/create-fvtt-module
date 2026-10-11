import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import * as prettier from 'prettier';

import type { TemplateData } from './answers.ts';

/** Templates carry this extension; every other file is copied byte for byte. */
const TEMPLATE_EXTENSION = '.hbs';

/** Renders a Handlebars template with the generator's helpers. */
export type Render = (template: string, data: TemplateData) => string;

/**
 * List every file below a directory.
 * @param directory - The directory to walk
 * @returns File paths relative to `directory`, sorted
 */
export function listFiles(directory: string): string[] {
  return fs
    .readdirSync(directory, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => path.relative(directory, path.join(entry.parentPath, entry.name)))
    .sort();
}

/**
 * Refuse to generate over existing work.
 * @param destination - The directory to generate into
 * @param force - Generate even when the directory already has content
 */
export function assertUsableDestination(destination: string, force: boolean): void {
  if (!fs.existsSync(destination)) return;
  if (!fs.statSync(destination).isDirectory()) throw new Error(`${destination} exists and is not a directory`);
  if (!force && fs.readdirSync(destination).length > 0) {
    throw new Error(`${destination} is not empty (run plop with --force to write into it anyway)`);
  }
}

/**
 * Write the project: render the `.hbs` templates, copy everything else unchanged, keeping file modes.
 *
 * Every template is rendered before anything is written, so a template error leaves no half-written project behind.
 * @param templates - Root of the template tree
 * @param data - What the templates are rendered with
 * @param render - The Handlebars renderer
 * @returns The files written, relative to the destination
 */
export function writeProject(templates: string, data: TemplateData, render: Render): string[] {
  const files = listFiles(templates).map(source => {
    const sourcePath = path.join(templates, source);
    if (!source.endsWith(TEMPLATE_EXTENSION)) return { sourcePath, target: source, content: undefined };

    try {
      const content = render(fs.readFileSync(sourcePath, 'utf8'), data);
      return { sourcePath, target: source.slice(0, -TEMPLATE_EXTENSION.length), content };
    } catch (error) {
      throw new Error(`Could not render ${source}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  for (const { sourcePath, target, content } of files) {
    const targetPath = path.join(data.destination, target);

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    if (content === undefined) fs.copyFileSync(sourcePath, targetPath);
    else fs.writeFileSync(targetPath, content);
    fs.chmodSync(targetPath, fs.statSync(sourcePath).mode);
  }

  return files.map(file => file.target);
}

/**
 * Format the generated files with the generated project's own Prettier configuration and ignore file.
 *
 * Rendered text changes length with the answers, which moves Prettier's line breaks; formatting here means a new
 * project passes its own format check however long its name is.
 * @param destination - The generated project
 * @param files - The files to format, relative to `destination`
 */
export async function formatProject(destination: string, files: string[]): Promise<void> {
  const ignorePath = path.join(destination, '.prettierignore');

  for (const file of files) {
    const filePath = path.join(destination, file);
    const info = await prettier.getFileInfo(filePath, { ignorePath });
    if (info.ignored || !info.inferredParser) continue;

    const source = fs.readFileSync(filePath, 'utf8');
    const options = await prettier.resolveConfig(filePath);
    const formatted = await prettier.format(source, { ...options, filepath: filePath });
    if (formatted !== source) fs.writeFileSync(filePath, formatted);
  }
}

/**
 * Make the generated project a git repository, unless it already is inside one.
 * @param destination - The generated project
 * @returns What was done
 */
export function initRepository(destination: string): string {
  try {
    execFileSync('git', ['rev-parse', '--is-inside-work-tree'], { cwd: destination, stdio: 'ignore' });
    return 'already inside a git repository';
  } catch {
    execFileSync('git', ['init', '--initial-branch', 'main'], { cwd: destination, stdio: 'ignore' });
    return 'initialised a git repository on branch main';
  }
}

/**
 * Install the generated project's dependencies, which also writes its lockfile and installs its git hooks.
 * @param destination - The generated project
 * @returns What was done
 */
export function installDependencies(destination: string): string {
  execFileSync('pnpm', ['install'], { cwd: destination, stdio: 'inherit' });
  return 'installed dependencies';
}
