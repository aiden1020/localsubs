import { readdir } from "node:fs/promises";
import path from "node:path";

export async function listFiles(root, relative = "") {
  const entries = await readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const child = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(root, child));
    } else if (entry.isFile()) {
      files.push(child.split(path.sep).join("/"));
    }
  }
  return files;
}
