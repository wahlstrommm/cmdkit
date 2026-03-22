#!/usr/bin/env node

try {
  await import("../dist/index.js");
} catch (error) {
  if (error instanceof Error && /dist\/index\.js|Cannot find module/.test(error.message)) {
    console.error("cmdkit is not built yet. Run `bun run build` before using the packaged bin locally.");
    process.exit(1);
  }

  throw error;
}
