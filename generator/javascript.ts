import { transformSync } from 'amaro';

/**
 * Turn TypeScript into the JavaScript it is once its types are taken away.
 *
 * Each type is replaced by the same amount of white space, so nothing else moves and every comment outside a type
 * declaration survives. The result needs formatting.
 * @param source - TypeScript that uses only erasable syntax (no enums, namespaces or parameter properties)
 * @returns The JavaScript
 * @throws {Error} When the source is not valid TypeScript, or uses syntax that cannot be erased
 */
export function stripTypes(source: string): string {
  return transformSync(source, { mode: 'strip-only' }).code;
}
