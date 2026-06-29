// Vercel's static-file resolution takes priority over rewrites for any
// request path that literally matches a file in the build output. Since
// "/" matches dist/index.html by default, our bot-detection rewrite for
// "/" (routing crawlers to api/list-meta.js) was silently skipped.
// Renaming the built entry file removes that collision so the rewrite
// rules apply uniformly for every path, including "/".
import { renameSync, existsSync } from "fs";

const from = "dist/index.html";
const to = "dist/app.html";

if (existsSync(from)) {
  renameSync(from, to);
  console.log(`Renamed ${from} -> ${to}`);
} else {
  console.error(`${from} not found — build output may have changed`);
  process.exit(1);
}
