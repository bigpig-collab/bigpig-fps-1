// EMBERLINE — make.fun hand-in assembler (threejs-fps-02).
//
// Packs the finished game plus its screenshots into the output directory
// the harness expects, then asks the kit's dossier builder to describe
// the bundle (file list, sizes, screenshot manifest) as dossier.json.
//
// Run with Node >= 22.18:  `node main.ts`  (or via the kit CLI).
// Output goes to $MAKEFUN_OUTPUT_DIR, falling back to /output.
// Only Node's standard library is used here.

import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-threejs.ts';

// Where this script lives: the entry root, next to game/ and screenshots/.
const entryRoot = dirname(fileURLToPath(import.meta.url));

// Destination: the harness-provided directory, or the plain /output path.
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

// Start from a clean slate so stale files can never leak into the bundle.
// NOTE: only the directory's CONTENTS are removed, never the directory
// itself — in the grader $MAKEFUN_OUTPUT_DIR (/output) is a mount point
// on a read-only root filesystem, so the directory itself cannot be
// removed (rmSync on it throws EACCES and the whole run fails); only
// files inside it can be deleted.
mkdirSync(outDir, { recursive: true });
for (const child of readdirSync(outDir)) {
  rmSync(join(outDir, child), { recursive: true, force: true });
}

// The playable game, copied whole (sources, vendor three.js, index.html).
cpSync(join(entryRoot, 'game'), join(outDir, 'game'), { recursive: true });

// The four staged screenshots, when they exist. The first one, by name,
// becomes the cover image for the listing.
const shotsDir = join(entryRoot, 'screenshots');
if (existsSync(shotsDir)) {
  cpSync(shotsDir, join(outDir, 'screenshots'), { recursive: true });
}

// Describe the bundle. The builder returns the dossier (schema
// makefun/dossier/v1) as canonical JSON bytes and enforces the
// competition caps: 160 KiB of hand-written source text, at most 4
// screenshots of 256 KiB each, at most 993 game files and 48 MiB of
// game bytes in total. It throws if any cap is breached, so a bad
// bundle fails loudly here instead of at upload time.
const dossierBytes = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
});
writeFileSync(join(outDir, 'dossier.json'), dossierBytes);

console.log(`packed entry into ${outDir}`);
