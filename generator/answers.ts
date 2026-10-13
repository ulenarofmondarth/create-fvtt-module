import { execFileSync } from 'node:child_process';
import path from 'node:path';

/** The languages a module can be generated in; the first is the default. */
export const LANGUAGES = ['typescript', 'javascript'] as const;

export type Language = (typeof LANGUAGES)[number];

/** What the user is asked for. Everything else in the generated project is derived from these. */
export interface Answers {
  /** Foundry package ID, also the name of the built bundle. */
  moduleId: string;
  /** Human-readable title shown in Foundry. */
  moduleTitle: string;
  description: string;
  authorName: string;
  /** Optional; left out of `module.json` when empty. */
  authorEmail: string;
  /** Optional; left out of `module.json` when empty. */
  authorUrl: string;
  /** Optional; left out of `module.json` when empty. */
  authorDiscord: string;
  /** GitHub user or organisation that owns the repository. */
  githubOwner: string;
  repoName: string;
  /** The exact Foundry VTT build the dev server and end-to-end tests run, e.g. `14.368.0`. */
  foundryVersion: string;
  /** Game system the end-to-end test world is created with. */
  systemId: string;
  /** Release archive of that system, downloaded for the end-to-end tests. */
  systemUrl: string;
  /** Whether `module.json` declares the system as a requirement. */
  restrictToSystem: boolean;
  /** What the module source, its tests and its scripts are written in. */
  language: Language;
  /** Directory to generate into, absolute or relative to the working directory. */
  destination: string;
  gitInit: boolean;
  install: boolean;
}

/** The answers plus the values derived from them: the data every template is rendered with. */
export interface TemplateData extends Answers {
  /** Oldest Foundry generation the module supports: the major of {@link Answers.foundryVersion}. */
  compatibilityMinimum: string;
  /** Root key of the module's localization strings. */
  langKey: string;
  /** Short string mixed into the module's scoped Svelte CSS class names. */
  svelteHashId: string;
  repoUrl: string;
  docsUrl: string;
  year: string;
  /** Whether {@link Answers.language} is TypeScript, for the templates to branch on. */
  typescript: boolean;
  /** Extension of the project's source files: `ts` or `js`. */
  ext: 'ts' | 'js';
}

/** The result of checking an answer: `true`, or the reason it is not acceptable. */
export type Validation = true | string;

/** Release archives of game systems the generator knows a pinned build of. */
const KNOWN_SYSTEM_URLS: Record<string, string> = {
  dnd5e: 'https://github.com/foundryvtt/dnd5e/releases/download/release-5.3.3/dnd5e-release-5.3.3.zip',
};

export const DEFAULT_FOUNDRY_VERSION = '14.368.0';
export const DEFAULT_SYSTEM_ID = 'dnd5e';
export const DEFAULT_LANGUAGE: Language = 'typescript';

/** The oldest Foundry VTT generation the templates target. */
const MINIMUM_FOUNDRY_GENERATION = 14;

/**
 * Foundry package IDs are lowercase alphanumeric words separated by hyphens.
 * @param value - The candidate ID
 * @returns `true`, or the reason the ID is not acceptable
 */
export function validateModuleId(value: string): Validation {
  if (/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(value)) return true;
  return 'Use lowercase letters, digits and single hyphens, starting with a letter (e.g. my-module)';
}

/**
 * @param label - What the value is, for the error message
 * @returns A validator that rejects blank input
 */
export function required(label: string): (value: string) => Validation {
  return value => (value.trim() ? true : `${label} is required`);
}

/**
 * @param value - The candidate GitHub user, organisation or repository name
 * @returns `true`, or the reason the name is not acceptable
 */
export function validateGithubName(value: string): Validation {
  return /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ? true : 'Use letters, digits, hyphens, underscores and dots only';
}

/**
 * @param value - The candidate Foundry VTT build
 * @returns `true`, or the reason the version is not acceptable
 */
export function validateFoundryVersion(value: string): Validation {
  const match = /^(\d+)\.\d+\.\d+$/.exec(value);
  if (!match) return `Give the exact build as generation.build.patch (e.g. ${DEFAULT_FOUNDRY_VERSION})`;
  if (Number(match[1]) < MINIMUM_FOUNDRY_GENERATION) {
    return `The template targets Foundry VTT ${MINIMUM_FOUNDRY_GENERATION} and later`;
  }
  return true;
}

/**
 * @param value - The candidate URL; blank is allowed
 * @returns `true`, or the reason the URL is not acceptable
 */
export function validateOptionalUrl(value: string): Validation {
  return !value || URL.canParse(value) ? true : 'Give a full URL (https://…) or leave this empty';
}

/**
 * @param value - The candidate URL
 * @returns `true`, or the reason the URL is not acceptable
 */
export function validateArchiveUrl(value: string): Validation {
  return URL.canParse(value) && value.endsWith('.zip') ? true : 'Give the full URL of the system release .zip';
}

/**
 * @param value - The candidate language
 * @returns `true`, or the reason the language is not acceptable
 */
export function validateLanguage(value: string): Validation {
  return (LANGUAGES as readonly string[]).includes(value) ? true : `Choose one of: ${LANGUAGES.join(', ')}`;
}

/**
 * @param systemId - A game system ID
 * @returns The pinned release archive the generator knows for that system, if any
 */
export function defaultSystemUrl(systemId: string): string | undefined {
  return KNOWN_SYSTEM_URLS[systemId];
}

/**
 * Turn a package ID into a title, e.g. `my-module` into `My Module`.
 * @param moduleId - A Foundry package ID
 * @returns A title-cased guess at the module's name
 */
export function titleFromId(moduleId: string): string {
  return moduleId
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * A short identifier for the module: the start of the first word of its ID plus the initials of the rest.
 * @param moduleId - A Foundry package ID
 * @returns Up to five lowercase characters
 */
export function svelteHashId(moduleId: string): string {
  const [first = '', ...rest] = moduleId.split('-');
  return (first.slice(0, 3) + rest.map(word => word.charAt(0)).join('')).slice(0, 5);
}

/**
 * Read a value from the user's git configuration, to offer as a default.
 * @param key - Configuration key, e.g. `user.name`
 * @returns The configured value, or an empty string
 */
export function gitConfig(key: string): string {
  try {
    return execFileSync('git', ['config', '--get', key], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * Validate a full set of answers and add the values derived from them.
 *
 * The prompts validate as the user types; this repeats the checks so that answers supplied any other way (command-line
 * bypass, a script, a test) are held to the same rules.
 * @param answers - The raw answers
 * @param now - The current date, for the copyright year
 * @returns The data to render the templates with
 */
export function resolveAnswers(answers: Answers, now = new Date()): TemplateData {
  const checks: [keyof Answers, Validation][] = [
    ['moduleId', validateModuleId(answers.moduleId)],
    ['moduleTitle', required('The module title')(answers.moduleTitle)],
    ['description', required('The description')(answers.description)],
    ['authorName', required('The author name')(answers.authorName)],
    ['authorUrl', validateOptionalUrl(answers.authorUrl)],
    ['githubOwner', validateGithubName(answers.githubOwner)],
    ['repoName', validateGithubName(answers.repoName)],
    ['foundryVersion', validateFoundryVersion(answers.foundryVersion)],
    ['systemId', validateModuleId(answers.systemId)],
    ['systemUrl', validateArchiveUrl(answers.systemUrl)],
    ['language', validateLanguage(answers.language)],
    ['destination', required('The destination directory')(answers.destination)],
  ];
  for (const [name, result] of checks) {
    if (result !== true) throw new Error(`Invalid ${name} "${String(answers[name])}": ${result}`);
  }

  return {
    ...answers,
    destination: path.resolve(answers.destination),
    compatibilityMinimum: answers.foundryVersion.split('.', 1)[0] ?? String(MINIMUM_FOUNDRY_GENERATION),
    langKey: answers.moduleId.toUpperCase(),
    svelteHashId: svelteHashId(answers.moduleId),
    repoUrl: `https://github.com/${answers.githubOwner}/${answers.repoName}`,
    docsUrl: `https://${answers.githubOwner.toLowerCase()}.github.io/${answers.repoName}/`,
    year: String(now.getFullYear()),
    typescript: answers.language === 'typescript',
    ext: answers.language === 'typescript' ? 'ts' : 'js',
  };
}
