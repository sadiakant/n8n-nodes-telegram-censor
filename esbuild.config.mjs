import esbuild from "esbuild";

console.log("Building n8n Telegram Censor nodes...");

await esbuild.build({
  entryPoints: [
    "src/inference.ts",
    "src/nodes/TelegramCensor.node.ts",
    "src/credentials/TelegramCensorCredentials.credentials.ts",
  ],

  bundle: true,
  platform: "node",
  outdir: "dist",
  outbase: "src",

  format: "cjs",
  target: "node18",

  external: ["n8n-workflow"],
  logLevel: "info",
});

console.log("Build finished successfully");
