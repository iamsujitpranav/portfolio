import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

// Next 16 removed `next lint`; eslint-config-next now ships native flat configs,
// so we spread them directly (no FlatCompat bridge).
const eslintConfig = [
  { ignores: [".next/**", "node_modules/**", "backend/**", "next-env.d.ts"] },
  ...coreWebVitals,
  ...typescript,
  {
    // Allow intentionally-unused bindings when prefixed with `_`
    // (e.g. `{ content: _content, ...meta }` to strip a key).
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    // React Three Fiber is imperative by design: renderer state, object3D
    // transforms and shared per-frame nav state are mutated inside useFrame /
    // effects every frame. The React-Compiler immutability rule flags this
    // valid pattern, so we disable it for the WebGL canvas code only.
    files: ["src/components/HeroCanvas.tsx", "src/components/journey/**/*.tsx"],
    rules: {
      "react-hooks/immutability": "off",
    },
  },
  {
    // The journey overlay must detect WebGL / pointer capabilities on the client
    // (browser-only APIs unavailable during SSR) and set state from that mount
    // effect — the standard "read a browser API on mount" pattern.
    files: ["src/components/journey/JourneyOverlay.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
];

export default eslintConfig;
