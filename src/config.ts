import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir, tmpdir } from "node:os";

const srcDir = dirname(fileURLToPath(import.meta.url));

export const PACKAGE_ROOT = resolve(srcDir, "..");
export const COMMANDS_ROOT = join(PACKAGE_ROOT, "commands");

const preferredLocalHome = process.env.CMDKIT_HOME ?? join(homedir(), ".config", "cmdkit");
const fallbackLocalHome = join(tmpdir(), "cmdkit-local");

let cachedLocalHome: string | undefined;
let cachedLocalCommandsDir: string | undefined;

export async function getLocalHome(): Promise<string> {
  if (cachedLocalHome) {
    return cachedLocalHome;
  }

  for (const candidate of [preferredLocalHome, fallbackLocalHome]) {
    try {
      await mkdir(candidate, { recursive: true });
      cachedLocalHome = candidate;
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("Could not create a writable cmdkit home directory.");
}

export async function getLocalCommandsDir(): Promise<string> {
  if (cachedLocalCommandsDir) {
    return cachedLocalCommandsDir;
  }

  for (const candidate of [join(preferredLocalHome, "commands"), join(fallbackLocalHome, "commands")]) {
    try {
      await mkdir(candidate, { recursive: true });
      cachedLocalCommandsDir = candidate;
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("Could not create a writable cmdkit commands directory.");
}

export async function getMetadataPath(): Promise<string> {
  return join(await getLocalHome(), "metadata.json");
}
