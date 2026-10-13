import path from 'node:path';

import type { Answers } from './answers.ts';
import { resolveAnswers } from './answers.ts';
import { render } from './render.ts';
import {
  assertUsableDestination,
  formatProject,
  initRepository,
  installDependencies,
  writeProject,
} from './scaffold.ts';

export type { Answers, Language, TemplateData, UiFramework, Validation } from './answers.ts';
export {
  DEFAULT_FOUNDRY_VERSION,
  DEFAULT_LANGUAGE,
  DEFAULT_SYSTEM_ID,
  DEFAULT_UI_FRAMEWORK,
  LANGUAGES,
  resolveAnswers,
  UI_FRAMEWORKS,
} from './answers.ts';
export type { ConfirmQuestion, InputQuestion, Question, SelectQuestion, SelectQuestionFor } from './questions.ts';
export { questions } from './questions.ts';

/**
 * The project that is generated, shipped alongside the compiled generator: `module` holds what every project gets, a
 * directory named after each language what only projects in that language get, and one named after a language and a UI
 * framework what only projects with both get.
 */
const TEMPLATES = path.join(import.meta.dirname, '../templates');

export interface GenerateOptions {
  /** Write into the destination even when it already has content. */
  force?: boolean;
  /** Called as each step finishes, with a short description of what was done. */
  onStep?: (message: string) => void;
}

export interface GenerateResult {
  /** The absolute path of the generated project. */
  destination: string;
  /** The files written, relative to {@link GenerateResult.destination}. */
  files: string[];
}

/**
 * Generate a Foundry VTT module project.
 *
 * The answers are validated before anything is written. `answers.gitInit` and `answers.install` decide whether the
 * new project is also made a git repository and has its dependencies installed (which needs `git` and `pnpm`).
 * @param answers - A complete set of answers; see {@link questions} for what each one means
 * @param options - How to generate
 * @returns Where the project is and what was written
 * @throws {Error} When an answer is invalid, or the destination has content and `options.force` is not set
 */
export async function generate(answers: Answers, options: GenerateOptions = {}): Promise<GenerateResult> {
  const report = options.onStep ?? (() => undefined);
  const data = resolveAnswers(answers);
  assertUsableDestination(data.destination, options.force === true);

  const trees = ['module', data.language, `${data.language}-${data.uiFramework}`];
  const files = writeProject(
    trees.map(tree => path.join(TEMPLATES, tree)),
    data,
    render,
  );
  await formatProject(data.destination, files);
  report(`wrote ${files.length} files in ${data.destination}`);

  // git comes first so that the install can set up the git hooks.
  if (answers.gitInit) report(initRepository(data.destination));
  if (answers.install) report(installDependencies(data.destination));

  return { destination: data.destination, files };
}
