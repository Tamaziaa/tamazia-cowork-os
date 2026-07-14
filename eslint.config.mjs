// no-undef ON THE AUDIT PIPELINE. This is the layer that was missing.
//
// The pipeline contract opened its stage manifest as a local const in buildPayload() and referenced it from
// build() - a DIFFERENT function. That is a ReferenceError: "_manifest is not defined". It killed every mint.
// 75 evals were green, because not one of them ever EXECUTES buildPayload() - they assert on source text and on
// pure helpers. A test suite that never runs the function cannot see a ReferenceError inside it.
//
// The contract that exists to stop a stage failing silently was itself the stage that failed. no-undef is the
// cheapest possible check that would have caught it, and it now runs on the files that build the legal document.
export default [
  {
    files: ['src/skills/S025-audit-page-builder/scripts/build.js',
            'src/skills/S008-personalisation-engine/scanners/*.js',
            'src/lib/audit/*.js', 'src/lib/util/*.js', 'src/lib/llm/*.js', 'src/lib/sourcing/markets.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly', module: 'writable', exports: 'writable', process: 'readonly',
        console: 'readonly', Buffer: 'readonly', __dirname: 'readonly', __filename: 'readonly',
        fetch: 'readonly', URL: 'readonly', URLSearchParams: 'readonly', AbortController: 'readonly',
        AbortSignal: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        setInterval: 'readonly', clearInterval: 'readonly', TextEncoder: 'readonly',
        TextDecoder: 'readonly', structuredClone: 'readonly', queueMicrotask: 'readonly',
      },
    },
    rules: { 'no-undef': 'error' },
  },
];
