import Handlebars from 'handlebars';

import type { TemplateData } from './answers.ts';

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

// A private instance, so the helpers do not leak into a Handlebars the host application may also be using.
const handlebars = Handlebars.create();

// Templates use triple braces throughout (no HTML escaping) and these helpers to stay valid in the target language.
handlebars.registerHelper('json', (value: unknown) => JSON.stringify(String(value)));
handlebars.registerHelper('ts', (value: unknown) => quoted(value, "'"));
handlebars.registerHelper('py', (value: unknown) => quoted(value, "'"));
// The last argument Handlebars passes to a helper is its options object.
handlebars.registerHelper('concat', (...parts: unknown[]) => parts.slice(0, -1).join(''));

/**
 * Render a Handlebars template with the generator's helpers.
 * @param template - The template source
 * @param data - What the template is rendered with
 * @returns The rendered text
 */
export function render(template: string, data: TemplateData): string {
  return handlebars.compile(template)(data);
}
