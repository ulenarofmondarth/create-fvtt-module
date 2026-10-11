import path from 'node:path';

import type { NodePlopAPI } from 'plop';

import type { Answers } from './generator/answers.ts';
import {
  DEFAULT_FOUNDRY_VERSION,
  DEFAULT_SYSTEM_ID,
  defaultSystemUrl,
  gitConfig,
  required,
  resolveAnswers,
  titleFromId,
  validateArchiveUrl,
  validateFoundryVersion,
  validateGithubName,
  validateModuleId,
  validateOptionalUrl,
} from './generator/answers.ts';
import {
  assertUsableDestination,
  formatProject,
  initRepository,
  installDependencies,
  writeProject,
} from './generator/scaffold.ts';

const TEMPLATES = path.join(import.meta.dirname, 'templates/module');

/**
 * Quote a value as a string literal.
 * @param value - The text
 * @param quote - The quote character of the target language
 * @returns The literal, with backslashes, quotes and line breaks escaped
 */
function quoted(value: unknown, quote: "'" | '"'): string {
  const escaped = String(value)
    .replaceAll('\\', '\\\\')
    .replaceAll(quote, `\\${quote}`)
    .replaceAll('\n', '\\n')
    .replaceAll('\r', '\\r');
  return `${quote}${escaped}${quote}`;
}

export default function (plop: NodePlopAPI): void {
  // Templates use triple braces throughout (no HTML escaping) and these helpers to stay valid in the target language.
  plop.setHelper('json', (value: unknown) => JSON.stringify(String(value)));
  plop.setHelper('ts', (value: unknown) => quoted(value, "'"));
  plop.setHelper('py', (value: unknown) => quoted(value, "'"));
  // The last argument Handlebars passes to a helper is its options object.
  plop.setHelper('concat', (...parts: unknown[]) => parts.slice(0, -1).join(''));

  plop.setActionType('scaffold', async (answers, config) => {
    const data = resolveAnswers(answers as Answers);
    assertUsableDestination(data.destination, config.force === true);

    const files = writeProject(TEMPLATES, data, (template, templateData) => plop.renderString(template, templateData));
    await formatProject(data.destination, files);
    return `${files.length} files in ${data.destination}`;
  });

  plop.setActionType('gitInit', answers => initRepository(path.resolve((answers as Answers).destination)));

  plop.setActionType('install', answers => installDependencies(path.resolve((answers as Answers).destination)));

  plop.setGenerator('module', {
    description: 'A new Foundry VTT module project',
    prompts: [
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
        default: (answers: Answers) => titleFromId(answers.moduleId),
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
        default: () => gitConfig('user.name'),
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
        default: (answers: Answers) => answers.moduleId,
        validate: validateGithubName,
      },
      {
        type: 'input',
        name: 'foundryVersion',
        message: 'Foundry VTT build to develop and test against:',
        default: DEFAULT_FOUNDRY_VERSION,
        validate: validateFoundryVersion,
      },
      {
        type: 'input',
        name: 'systemId',
        message: 'Game system for the end-to-end test world:',
        default: DEFAULT_SYSTEM_ID,
        validate: validateModuleId,
      },
      {
        type: 'input',
        name: 'systemUrl',
        message: 'URL of the release .zip of that system to pin for the tests:',
        default: (answers: Answers) => defaultSystemUrl(answers.systemId),
        validate: validateArchiveUrl,
      },
      {
        type: 'confirm',
        name: 'restrictToSystem',
        message: 'Does the module require that game system (declared in module.json)?',
        default: false,
      },
      {
        type: 'input',
        name: 'destination',
        message: 'Directory to create the project in:',
        default: (answers: Answers) => path.join('..', answers.moduleId),
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
    ],
    actions: answers => {
      const { gitInit, install } = answers as Answers;
      return [
        { type: 'scaffold' },
        // git comes first so that the install can set up the git hooks.
        ...(gitInit ? [{ type: 'gitInit' }] : []),
        ...(install ? [{ type: 'install' }] : []),
      ];
    },
  });
}
