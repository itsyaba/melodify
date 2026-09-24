// Loaded with `node --import` before the tests. Node strips the TypeScript types itself, but it
// does not know Metro's resolution: the `@/` alias for src/, and relative imports written without
// an extension. With this, a test can import a module that has runtime imports of its own.
import { registerHooks } from 'node:module';
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const src = path.resolve(import.meta.dirname, '../src');
const EXTENSIONS = ['', '.ts', '.tsx', '.js', '/index.ts'];

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    let base = null;
    if (specifier.startsWith('@/')) {
      base = path.join(src, specifier.slice(2));
    } else if (
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context.parentURL?.startsWith('file:')
    ) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (base) {
      for (const ext of EXTENSIONS) {
        if (isFile(base + ext)) return nextResolve(pathToFileURL(base + ext).href, context);
      }
    }
    return nextResolve(specifier, context);
  },
});
