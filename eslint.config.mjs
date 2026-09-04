import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // ANY build directory, not just the default one.
    //
    // `.gitignore` has `/.next-*`, so a build written to `.next-verify` (which
    // is what you get from `next build --distDir`) is invisible to git and
    // therefore invisible to CI - but ESLint was still linting it locally. That
    // is ~1,100 errors in generated bundles that CI never sees, which makes
    // `npm run lint` locally disagree with `npm run lint` on the runner in the
    // one direction that matters: it cries wolf, so a real error hides in the
    // noise. Exactly that happened.
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Editor local-history snapshots (VS Code Local History) - not real source.
    ".history/**",
    // Tooling config that is not application source.
    ".trunk/**",
  ]),

  {
    name: "sync/react-compiler-migration",
    // The plugin has to be named in the SAME config object as its rules, even
    // though eslint-config-next already registers it in its own objects.
    plugins: { "react-hooks": reactHooks },
    rules: {
      /**
       * React Compiler rules: WARN, not error, and deliberately so.
       *
       * `eslint-config-next` ships these at error severity. They are real
       * advice - each one describes a pattern the compiler cannot safely
       * memoize - but they arrived as errors on a codebase that predates them,
       * flagging 22 existing call sites across admin, vendor, food and
       * messaging code written by several people.
       *
       * Failing CI on all 22 leaves two bad options: block every push until
       * unrelated feature code is refactored, or bulk-add eslint-disable
       * comments that hide the advice permanently. Warning keeps every one of
       * them printed on every run and in every PR, so they get fixed by the
       * person who owns that code, with the ability to actually test it -
       * while a genuinely new violation still shows up in the diff.
       *
       * THIS IS A MIGRATION SETTING, NOT A VERDICT. Raise each rule back to
       * "error" as its last call site is cleared; the counts below are what
       * was outstanding when this was written (2026-08-30).
       *
       *   react-hooks/set-state-in-effect  (9)  cascading renders
       *   react-hooks/static-components    (7)  all in food-comps/VendorClient
       *   react-hooks/purity               (3)  Date.now() during render
       *   react-hooks/refs                 (3)  lib/query/use-realtime
       *
       * Do not add rules here to silence a mess you just made. A violation in
       * code you are writing now is a violation to fix now.
       */
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
    },
  },
]);

export default eslintConfig;
