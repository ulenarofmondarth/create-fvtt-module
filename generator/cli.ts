#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { confirm, input } from '@inquirer/prompts';

import type { Answers } from './answers.ts';
import { generate } from './index.ts';
import type { Question } from './questions.ts';
import { questions } from './questions.ts';

type Flags = Record<string, string | boolean | undefined>;

/** Width of the option column in the usage text. */
const WIDTH = 28;

/**
 * @param name - An answer name, e.g. `moduleId`
 * @returns The command-line option for it, e.g. `module-id`
 */
export function optionName(name: string): string {
  return name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

/**
 * @returns The usage text, listing an option for every question
 */
export function usage(): string {
  const options = questions.map(question => {
    const flag = question.type === 'confirm' ? `--[no-]${optionName(question.name)}` : `--${optionName(question.name)}`;
    return `  ${flag.padEnd(WIDTH)} ${question.message.replace(/[:?]$/, '')}`;
  });

  return [
    'Usage: create-fvtt-module [destination] [options]',
    '',
    'Creates a Foundry VTT module project. Anything not given as an option is asked for.',
    '',
    'Answers:',
    ...options,
    '',
    'Options:',
    `  ${'-y, --yes'.padEnd(WIDTH)} Do not ask: use the default for every answer not given`,
    `  ${'-f, --force'.padEnd(WIDTH)} Write into the destination even if it is not empty`,
    `  ${'-h, --help'.padEnd(WIDTH)} Show this help`,
    `  ${'-v, --version'.padEnd(WIDTH)} Show the version`,
  ].join('\n');
}

/**
 * Parse the command line.
 * @param args - The arguments after the program name
 * @returns The option values by option name, and the destination if it was given as a positional argument
 */
export function parseCommandLine(args: string[]): { flags: Flags; destination: string | undefined } {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    allowNegative: true,
    options: {
      ...Object.fromEntries(
        questions.map(question => [
          optionName(question.name),
          { type: question.type === 'confirm' ? ('boolean' as const) : ('string' as const) },
        ]),
      ),
      yes: { type: 'boolean', short: 'y' },
      force: { type: 'boolean', short: 'f' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
  });

  if (positionals.length > 1) throw new Error(`Unexpected argument "${String(positionals[1])}"`);
  return { flags: values, destination: positionals[0] };
}

/**
 * Settle one answer: from the command line if it was given there, otherwise by asking, or from the default when not
 * asking.
 * @param question - The question to answer
 * @param given - The value from the command line, if any
 * @param answers - The answers so far, which later defaults are derived from
 * @param ask - Whether the user may be prompted
 * @returns The answer
 */
async function answer(
  question: Question,
  given: string | boolean | undefined,
  answers: Partial<Answers>,
  ask: boolean,
): Promise<string | boolean> {
  const option = `--${optionName(question.name)}`;

  if (question.type === 'confirm') {
    if (typeof given === 'boolean') return given;
    return ask ? confirm({ message: question.message, default: question.default }) : question.default;
  }

  const validate = question.validate ?? (() => true);
  if (typeof given === 'string') {
    const result = validate(given);
    if (result !== true) throw new Error(`Invalid ${option} "${given}": ${result}`);
    return given;
  }

  const fallback = question.default?.(answers);
  if (ask)
    return input({ message: question.message, validate, ...(fallback === undefined ? {} : { default: fallback }) });

  // Not asking: take the default, or nothing at all where nothing is acceptable.
  const value = fallback ?? '';
  if (validate(value) !== true) throw new Error(`${option} is required`);
  return value;
}

/**
 * Run the command line.
 * @param args - The arguments after the program name
 */
export async function main(args: string[]): Promise<void> {
  const { flags, destination } = parseCommandLine(args);

  if (flags['help']) return console.log(usage());
  if (flags['version']) {
    const manifest = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../package.json'), 'utf8')) as {
      version: string;
    };
    return console.log(manifest.version);
  }

  // Without a terminal there is nobody to ask, so behave as with --yes and fail on what is missing.
  const ask = flags['yes'] !== true && process.stdin.isTTY === true;
  const answers: Partial<Record<keyof Answers, string | boolean>> = {};

  for (const question of questions) {
    const given =
      question.name === 'destination' ? (destination ?? flags['destination']) : flags[optionName(question.name)];
    answers[question.name] = await answer(question, given, answers as Partial<Answers>, ask);
  }

  const result = await generate(answers as Answers, {
    force: flags['force'] === true,
    onStep: message => console.log(`✔ ${message}`),
  });

  console.log(`\nYour module is in ${result.destination}`);
  console.log('Next steps are in its docs/developers/setup.md and CONTRIBUTING.md.');
}

// Run only as the program, so the functions above can be imported and tested.
if (process.argv[1] !== undefined && fs.realpathSync(process.argv[1]) === import.meta.filename) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    // Ctrl-C at a prompt is a decision, not a failure to report.
    if (error instanceof Error && error.name === 'ExitPromptError') process.exit(130);
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
