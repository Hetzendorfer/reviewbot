export interface FileDiff {
  path: string;
  hunks: string;
}

export function parseDiff(rawDiff: string): FileDiff[] {
  const files: FileDiff[] = [];
  const fileSections = rawDiff.split(/^diff --git /m).filter(Boolean);

  for (const section of fileSections) {
    const pathMatch = section.match(/^a\/(.+?)\s+b\/(.+)/m);
    if (!pathMatch) continue;

    const path = pathMatch[2];

    // Skip binary files
    if (section.includes("Binary files")) continue;

    // Extract everything from the first @@ hunk header onwards
    const hunkStart = section.indexOf("@@");
    if (hunkStart === -1) continue;

    const hunks = section.slice(hunkStart);
    files.push({ path, hunks });
  }

  return files;
}

export function filterFiles(
  files: FileDiff[],
  ignorePaths: string[],
  maxFiles: number
): FileDiff[] {
  const { minimatch } = require("minimatch");

  const filtered = files.filter((file) => {
    return !ignorePaths.some((pattern) => minimatch(file.path, pattern));
  });

  return filtered.slice(0, maxFiles);
}

export function chunkDiffs(
  files: FileDiff[],
  maxCharsPerChunk: number = 30_000
): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const file of files) {
    const fileBlock = `### ${file.path}\n${file.hunks}\n\n`;
    if (current.length + fileBlock.length > maxCharsPerChunk && current) {
      chunks.push(current);
      current = "";
    }
    current += fileBlock;
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}
