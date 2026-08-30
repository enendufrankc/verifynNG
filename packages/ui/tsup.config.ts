import { readFileSync, globSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'tsup';
import type { Plugin } from 'esbuild';

// tsup bundles every export from src/index.ts into one dist/index.js/.cjs file.
// esbuild strips top-of-file 'use client' directives during bundling, so any
// hook-using component (ReportForm, and the various Radix-based primitives)
// loses the directive Next.js's RSC compiler needs to draw the client
// boundary — even though purely presentational exports (EmptyState, Badge,
// etc.) don't need one at all.
//
// Fix: give every component file its own tsup entry point (not just the ones
// that declare 'use client'). esbuild's code splitting only extracts a module
// into its own chunk when it's reachable from more than one entry's import
// graph — a shared, server-safe helper like EmptyState that a client-only
// component (e.g. DataTable) also happens to import would otherwise be
// merged into the SAME chunk as that client component (both are reachable
// from the identical {index.ts, data-table.tsx} entry pair), dragging the
// 'use client' tag onto code that never asked for it. Making every component
// its own entry gives each one a distinct reachability set, so splitting
// isolates it into its own chunk. The plugin below then re-attaches
// 'use client' to exactly the output chunks that contain a source file which
// declared it, leaving every other chunk untouched.
const componentEntries = globSync('src/components/**/*.{ts,tsx}', {
  cwd: process.cwd(),
}).filter((file) => !/\.(stories|test)\.tsx?$/.test(file));

function preserveUseClientPlugin(): Plugin {
  return {
    name: 'preserve-use-client',
    setup(build) {
      build.initialOptions.metafile = true;

      const directiveCache = new Map<string, boolean>();
      const hasUseClientDirective = (inputPath: string) => {
        const cached = directiveCache.get(inputPath);
        if (cached !== undefined) return cached;
        let value = false;
        try {
          const head = readFileSync(path.join(process.cwd(), inputPath), 'utf8')
            .trimStart()
            .slice(0, 20);
          value =
            head.startsWith("'use client'") || head.startsWith('"use client"');
        } catch {
          value = false;
        }
        directiveCache.set(inputPath, value);
        return value;
      };

      build.onEnd((result) => {
        if (!result.metafile || !result.outputFiles) return;

        // tsup runs esbuild with write:false and writes result.outputFiles to
        // disk itself after every onEnd plugin has run — so the fix has to
        // mutate the in-memory output, not the (not-yet-written) files on disk.
        const taintedOutputs = new Set(
          Object.entries(result.metafile.outputs)
            .filter(([outputPath]) => /\.(js|cjs)$/.test(outputPath))
            .filter(([, meta]) =>
              Object.keys(meta.inputs).some(hasUseClientDirective),
            )
            .map(([outputPath]) => path.resolve(process.cwd(), outputPath)),
        );
        if (taintedOutputs.size === 0) return;

        for (const file of result.outputFiles) {
          if (!taintedOutputs.has(path.resolve(file.path))) continue;
          if (
            file.text.startsWith("'use client'") ||
            file.text.startsWith('"use client"')
          )
            continue;
          file.contents = new TextEncoder().encode(
            `'use client';\n${file.text}`,
          );
        }
      });
    },
  };
}

export default defineConfig({
  entry: ['src/index.ts', 'src/tailwind-preset.ts', ...componentEntries],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  splitting: true,
  esbuildPlugins: [preserveUseClientPlugin()],
  external: ['react', 'react-dom'],
});
