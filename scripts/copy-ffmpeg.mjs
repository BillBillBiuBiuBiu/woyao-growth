import { copyFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src  = join(root, "node_modules/@ffmpeg/core/dist/umd");
const dest = join(root, "public/ffmpeg");

mkdirSync(dest, { recursive: true });

for (const file of ["ffmpeg-core.js", "ffmpeg-core.wasm"]) {
  const from = join(src, file);
  const to   = join(dest, file);
  if (!existsSync(from)) {
    console.error(`Missing: ${from}`);
    process.exit(1);
  }
  copyFileSync(from, to);
  console.log(`Copied ${file} → public/ffmpeg/`);
}
