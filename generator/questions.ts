import type { Answers, Validation } from './answers.ts';
import {
  DEFAULT_FOUNDRY_VERSION,
  DEFAULT_LANGUAGE,
  DEFAULT_SYSTEM_ID,
  DEFAULT_UI_FRAMEWORK,
  defaultSystemUrl,
  gitConfig,
  required,
  titleFromId,
  validateArchiveUrl,
  validateFoundryVersion,
  validateGithubName,
  validateModuleId,
  validateOptionalUrl,
} from './answers.ts';

type AnswersOfType<T> = { [K in keyof Answers]: Answers[K] extends T ? K : never }[keyof Answers];

/** A question answered with text. */
export interface InputQuestion {
  type: 'input';
  name: AnswersOfType<string>;
  message: string;
  /** The value offered when the earlier answers are known; `undefined` when there is nothing sensible to offer. */
  default?: (answers: Partial<Answers>) => string | undefined;
  /** Left out when any text, including none, is acceptable. */
  validate?: (value: string) => Validation;
}

/** A question answered with yes or no. */
export interface ConfirmQuestion {
  type: 'confirm';
  name: AnswersOfType<boolean>;
  message: string;
  default: boolean;
}

/**
 * A question answered by picking one of a fixed set of values.
 * @template K - The answer the question settles
 */
export interface SelectQuestionFor<K extends keyof Answers> {
  type: 'select';
  name: K;
  message: string;
  choices: readonly { value: Answers[K]; name: string }[];
  default: Answers[K];
}

export type SelectQuestion = SelectQuestionFor<'language'> | SelectQuestionFor<'uiFramework'>;

export type Question = InputQuestion | ConfirmQuestion | SelectQuestion;

/**
 * Everything the generator needs to know, in the order to ask for it.
 *
 * This is data rather than a prompt session so that a host (the bundled command line, or another tool embedding the
 * generator) can present the questions its own way: as prompts, as command-line options, or both.
 */
export const questions: readonly Question[] = [
  {
    type: 'input',
    name: 'moduleId',
    message: 'Module ID (the Foundry package ID, e.g. my-module):',
    validate: validateModuleId,
  },
  {
    type: 'input',
    name: 'moduleTitle',
    message: 'Module title (shown in Foundry):',
    default: answers => (answers.moduleId ? titleFromId(answers.moduleId) : undefined),
    validate: required('The module title'),
  },
  {
    type: 'input',
    name: 'description',
    message: 'One-line description:',
    validate: required('The description'),
  },
  {
    type: 'input',
    name: 'authorName',
    message: 'Author name:',
    default: () => gitConfig('user.name') || undefined,
    validate: required('The author name'),
  },
  {
    type: 'input',
    name: 'authorEmail',
    message: 'Author email (optional, published in module.json):',
  },
  {
    type: 'input',
    name: 'authorUrl',
    message: 'Author website (optional):',
    validate: validateOptionalUrl,
  },
  {
    type: 'input',
    name: 'authorDiscord',
    message: 'Author Discord username (optional):',
  },
  {
    type: 'input',
    name: 'githubOwner',
    message: 'GitHub user or organisation that will own the repository:',
    validate: validateGithubName,
  },
  {
    type: 'input',
    name: 'repoName',
    message: 'GitHub repository name:',
    default: answers => answers.moduleId,
    validate: validateGithubName,
  },
  {
    type: 'input',
    name: 'foundryVersion',
    message: 'Foundry VTT build to develop and test against:',
    default: () => DEFAULT_FOUNDRY_VERSION,
    validate: validateFoundryVersion,
  },
  {
    type: 'input',
    name: 'systemId',
    message: 'Game system for the end-to-end test world:',
    default: () => DEFAULT_SYSTEM_ID,
    validate: validateModuleId,
  },
  {
    type: 'input',
    name: 'systemUrl',
    message: 'URL of the release .zip of that system to pin for the tests:',
    default: answers => (answers.systemId ? defaultSystemUrl(answers.systemId) : undefined),
    validate: validateArchiveUrl,
  },
  {
    type: 'confirm',
    name: 'restrictToSystem',
    message: 'Does the module require that game system (declared in module.json)?',
    default: false,
  },
  {
    type: 'select',
    name: 'language',
    message: 'Language to write the module in:',
    choices: [
      { value: 'typescript', name: 'TypeScript' },
      { value: 'javascript', name: 'JavaScript' },
    ],
    default: DEFAULT_LANGUAGE,
  },
  {
    type: 'select',
    name: 'uiFramework',
    message: 'UI framework to set the project up for:',
    choices: [
      { value: 'svelte', name: 'Svelte' },
      { value: 'none', name: 'None' },
    ],
    default: DEFAULT_UI_FRAMEWORK,
  },
  {
    type: 'input',
    name: 'destination',
    message: 'Directory to create the project in:',
    default: answers => answers.moduleId,
    validate: required('The destination directory'),
  },
  {
    type: 'confirm',
    name: 'gitInit',
    message: 'Initialise a git repository there?',
    default: true,
  },
  {
    type: 'confirm',
    name: 'install',
    message: 'Run pnpm install there (creates the lockfile and installs the git hooks)?',
    default: true,
  },
];
