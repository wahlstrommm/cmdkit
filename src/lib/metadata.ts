import { writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { getMetadataPath } from "../config";
import type { CommandMetadata } from "../types";
import { ensureDir, readJsonFile } from "./fs";

const EMPTY_METADATA: CommandMetadata = {
  favorites: [],
  recent: []
};

export async function loadMetadata(): Promise<CommandMetadata> {
  const metadataPath = await getMetadataPath();
  return readJsonFile(metadataPath, EMPTY_METADATA);
}

export async function saveMetadata(metadata: CommandMetadata): Promise<void> {
  const metadataPath = await getMetadataPath();
  await ensureDir(dirname(metadataPath));
  await writeFile(metadataPath, JSON.stringify(metadata, null, 2), "utf8");
}

export async function markRecent(id: string): Promise<void> {
  const metadata = await loadMetadata();
  metadata.recent = [id, ...metadata.recent.filter((entry) => entry !== id)].slice(0, 20);
  try {
    await saveMetadata(metadata);
  } catch {
    // Ignore metadata persistence failures so read-only environments still work.
  }
}

export async function toggleFavorite(id: string): Promise<boolean> {
  const metadata = await loadMetadata();
  const exists = metadata.favorites.includes(id);
  metadata.favorites = exists
    ? metadata.favorites.filter((entry) => entry !== id)
    : [id, ...metadata.favorites];
  try {
    await saveMetadata(metadata);
  } catch {
    return !exists;
  }
  return !exists;
}
