import vinext from "vinext";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { readExecutionProfile } from "./scripts/execution-profile.mjs";
import { sites } from "./build/sites-vite-plugin";

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";
const managedLinux = readExecutionProfile() === "managed-linux";
const projectRoot = fileURLToPath(new URL(".", import.meta.url));

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
  ],
});
