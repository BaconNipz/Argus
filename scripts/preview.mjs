import { createReadStream, existsSync } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = dirname(fileURLToPath(new URL("../package.json", import.meta.url)));
const dist = join(root, "dist");
const port = Number(process.env.PORT || 4173);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml"
};

if (!existsSync(dist)) {
  console.error("dist/ does not exist. Run npm run build first.");
  process.exit(1);
}

function resolvePath(url) {
  const parsed = new URL(url, `http://127.0.0.1:${port}`);
  let pathname = decodeURIComponent(parsed.pathname);
  if (pathname === "/" || pathname.endsWith("/share-target")) {
    pathname = "/index.html";
  }
  const fullPath = normalize(join(dist, pathname));
  if (!fullPath.startsWith(dist)) {
    return join(dist, "index.html");
  }
  return fullPath;
}

createServer(async (request, response) => {
  try {
    const filePath = resolvePath(request.url);
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "content-type": mimeTypes[extname(filePath)] || "application/octet-stream",
      "cache-control": "no-store"
    });
    createReadStream(filePath).pipe(response);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`Argus preview: http://127.0.0.1:${port}`);
});

