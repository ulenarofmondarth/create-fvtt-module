import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import * as prettier from 'prettier';

import type { Language, TemplateData } from './answers.ts';
import { stripTypes } from './javascript.ts';

/** Templates carry this extension; every other file is copied byte for byte. */
const TEMPLATE_EXTENSION = '.hbs';

/**
 * Files stored in the template tree under another name, by the name they are written as.
 *
 * Package managers leave files with these names out of a published package (npm drops a nested `.gitignore`, pnpm a
 * nested `pnpm-lock.yaml`), so the templates could not ship them under their real names.
 */
const STORED_AS: Readonly<Record<string, string>> = {
  '.gitignore': '_gitignore',
  'pnpm-lock.yaml': '_pnpm-lock.yaml',
};

/**
 * Directories the project needs from the start although nothing is in them yet.
 *
 * Docker creates as root whatever is missing of a bind mount: its source, and the directories leading to a mount
 * point inside another mount. The Foundry VTT server in the container cannot then write there. Made here, the
 * development server's data directory, down to where the project is mounted in it as a module, belongs to whoever
 * generated the project. Keep in step with the `serve:vtt` script, which does the same for a fresh clone.
 * @param data - What the templates are rendered with
 * @returns The directories, relative to the project
 */
function emptyDirectories(data: TemplateData): string[] {
  return [`.foundryvtt/data/Data/modules/${data.moduleId}`];
}

const WRITTEN_AS = new Map(Object.entries(STORED_AS).map(([written, stored]) => [stored, written]));

/** A TypeScript source file, as opposed to a declaration file, which has no JavaScript counterpart. */
const TYPESCRIPT_SOURCE = /(?<!\.d)\.ts$/;

/**
 * @param source - A file in a template tree, relative to its root
 * @param language - The language of the generated project
 * @returns The path the file is written to, relative to the generated project
 */
export function targetPath(source: string, language: Language): string {
  const rendered = source.endsWith(TEMPLATE_EXTENSION) ? source.slice(0, -TEMPLATE_EXTENSION.length) : source;
  const written = WRITTEN_AS.get(rendered) ?? rendered;
  return language === 'javascript' ? written.replace(TYPESCRIPT_SOURCE, '.js') : written;
}

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
    throw new Error(`${destination} is not empty (use --force to write into it anyway)`);
  }
}

/**
 * Write the project: render the `.hbs` templates, copy everything else unchanged, keeping file modes, and create the
 * directories that start out empty.
 *
 * The templates are TypeScript. For a JavaScript project the types are stripped from each TypeScript source file,
 * which is then written as `.js`; formatting the project afterwards tidies the gaps that leaves.
 *
 * Every file is rendered before anything is written, so a template error leaves no half-written project behind.
 * @param templates - Roots of the template trees; a file in a later tree replaces the same file from an earlier one
 * @param data - What the templates are rendered with
 * @param render - The Handlebars renderer
 * @returns The files written, relative to the destination
 */
export function writeProject(templates: string[], data: TemplateData, render: Render): string[] {
  const files = new Map<string, { sourcePath: string; content: string | undefined }>();

  for (const root of templates) {
    // A tree with no files in it is not there at all in a published package.
    if (!fs.existsSync(root)) continue;

    for (const source of listFiles(root)) {
      const sourcePath = path.join(root, source);
      const target = targetPath(source, data.language);
      const isTemplate = source.endsWith(TEMPLATE_EXTENSION);
      const isConverted = target !== targetPath(source, 'typescript');
      if (!isTemplate && !isConverted) {
        files.set(target, { sourcePath, content: undefined });
        continue;
      }

      try {
        const text = fs.readFileSync(sourcePath, 'utf8');
        const rendered = isTemplate ? render(text, data) : text;
        files.set(target, { sourcePath, content: isConverted ? stripTypes(rendered) : rendered });
      } catch (error) {
        throw new Error(`Could not render ${source}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  for (const [target, { sourcePath, content }] of files) {
    const writtenPath = path.join(data.destination, target);

    fs.mkdirSync(path.dirname(writtenPath), { recursive: true });
    if (content === undefined) fs.copyFileSync(sourcePath, writtenPath);
    else fs.writeFileSync(writtenPath, content);
    fs.chmodSync(writtenPath, fs.statSync(sourcePath).mode);
  }

  for (const directory of emptyDirectories(data))
    fs.mkdirSync(path.join(data.destination, directory), { recursive: true });

  return [...files.keys()].sort();
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
