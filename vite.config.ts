import vinext from "vinext";
import { nitro } from "nitro/vite";
import { defineConfig, type ResolvedConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";
const projectRoot = fileURLToPath(new URL(".", import.meta.url));

const VINEXT_NAVIGATION_CHUNK_GROUP = {
  name: "vinext-navigation",
  test: /(?:^|[\\/])vinext[\\/]dist[\\/]shims[\\/]navigation\.js(?:\?|$)/,
  minSize: 0,
};

function withPreservedVinextNavigationExports(output: Record<string, unknown>) {
  const splitting =
    output.codeSplitting && typeof output.codeSplitting === "object"
      ? { ...(output.codeSplitting as Record<string, unknown>) }
      : {};
  const groups = Array.isArray(splitting.groups) ? [...splitting.groups] : [];
  if (!groups.some((group) => group && typeof group === "object" && (group as { name?: string }).name === VINEXT_NAVIGATION_CHUNK_GROUP.name)) {
    groups.unshift(VINEXT_NAVIGATION_CHUNK_GROUP);
  }
  splitting.groups = groups;
  return {
    ...output,
    minifyInternalExports: false,
    codeSplitting: splitting,
  };
}

const VINEXT_LINK_NAVIGATION_EXPORTS = [
  "DYNAMIC_NAVIGATION_CACHE_TTL",
  "PREFETCH_CACHE_TTL",
  "createAppPrefetchRequestHeaders",
  "discardLearningOnlyPrefetchCacheEntry",
  "getMountedSlotsHeader",
  "getPrefetchCache",
  "getPrefetchInterceptionContext",
  "getPrefetchedUrls",
  "hasPrefetchCacheEntryForNavigation",
  "hasSearchAgnosticPrefetchShellForRoute",
  "navigateClientSide",
  "peekPrefetchResponseForNavigation",
  "prefetchRscResponse",
  "prepareNavigationPrefetchSnapshot",
  "restoreRscResponse",
] as const;

/**
 * vinext's next/link shim dynamically `import()`s `./navigation.js` and then
 * reads original export names (`navigateClientSide`, `getPrefetchInterceptionContext`).
 * Rolldown merges that module into the client entry and tree-shakes those
 * unused-looking exports, so production Link clicks call `undefined`.
 * Named imports plus a dedicated chunk keep one shared runtime.
 */
const preserveVinextNavigationExports = {
  name: "vinext-preserve-navigation-exports",
  enforce: "pre" as const,
  transform(code: string, id: string) {
    const normalizedId = id.replaceAll("\\", "/");
    if (!normalizedId.endsWith("/vinext/dist/shims/link.js")) return;
    if (code.includes("const __vinextNavigation =")) return;
    if (!code.includes('import("./navigation.js")')) return;
    const names = VINEXT_LINK_NAVIGATION_EXPORTS.join(", ");
    const prefixed = code.includes('"use client";\n')
      ? code.replace(
          '"use client";\n',
          `"use client";\nimport { ${names} } from "./navigation.js";\nconst __vinextNavigation = { ${names} };\n`,
        )
      : `import { ${names} } from "./navigation.js";\nconst __vinextNavigation = { ${names} };\n${code}`;
    return {
      code: prefixed.replace('import("./navigation.js")', "Promise.resolve(__vinextNavigation)"),
      map: null,
    };
  },
  config() {
    const output = withPreservedVinextNavigationExports({});
    return {
      build: { rolldownOptions: { output } },
      environments: {
        client: { build: { rolldownOptions: { output } } },
      },
    };
  },
  configResolved(config: ResolvedConfig) {
    const environments = [
      config,
      (config as ResolvedConfig & { environments?: { client?: ResolvedConfig } }).environments?.client,
    ].filter(Boolean);
    for (const environment of environments) {
      const build = (environment as { build?: { rolldownOptions?: { output?: unknown } } }).build;
      if (!build) continue;
      const rolldownOptions = (build.rolldownOptions ??= {});
      const output = rolldownOptions.output;
      if (Array.isArray(output)) {
        rolldownOptions.output = output.map((item) =>
          withPreservedVinextNavigationExports(
            item && typeof item === "object" ? { ...(item as Record<string, unknown>) } : {},
          ),
        );
      } else {
        rolldownOptions.output = withPreservedVinextNavigationExports(
          output && typeof output === "object" ? { ...(output as Record<string, unknown>) } : {},
        );
      }
    }
  },
};

export default defineConfig({
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  resolve: {
    alias: {
      tailwindcss: `${projectRoot}/node_modules/tailwindcss/index.css`,
      "tw-animate-css": `${projectRoot}/node_modules/tw-animate-css/dist/tw-animate.css`,
    },
  },
  server: {
    ...(managedLinux ? { host: "0.0.0.0", allowedHosts: ["terminal.local"] } : {}),
    ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
  },
  plugins: [
    vinext(),
    sites({ mockAuth: !managedLinux }),
    nitro(),
    preserveVinextNavigationExports,
  ],
});
