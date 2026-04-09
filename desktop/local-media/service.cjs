const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const MEDIA_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.mp4',
  '.mov',
  '.m4v',
  '.webm',
  '.mp3',
  '.wav',
  '.m4a',
  '.aac'
]);

const normalizeEntry = (inputPath, root) => {
  const stat = fs.statSync(inputPath);
  return {
    path: inputPath,
    relativePath: path.relative(root, inputPath),
    size: stat.size,
    updatedAt: stat.mtime.toISOString(),
    ext: path.extname(inputPath).toLowerCase()
  };
};

const collectMediaFiles = async (rootDir, maxItems = 800) => {
  const entries = [];
  const queue = [rootDir];
  while (queue.length > 0 && entries.length < maxItems) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    let dirents = [];
    try {
      dirents = await fsp.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const dirent of dirents) {
      if (entries.length >= maxItems) {
        break;
      }
      const absPath = path.join(current, dirent.name);
      if (dirent.isDirectory()) {
        queue.push(absPath);
        continue;
      }
      const ext = path.extname(dirent.name).toLowerCase();
      if (!MEDIA_EXTENSIONS.has(ext)) {
        continue;
      }
      try {
        entries.push(normalizeEntry(absPath, rootDir));
      } catch {
        // Ignore a single unreadable file and keep indexing the rest.
      }
    }
  }
  return entries;
};

module.exports = {
  MEDIA_EXTENSIONS,
  collectMediaFiles
};
