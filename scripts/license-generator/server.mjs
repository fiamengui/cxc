import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { issueLicense, listLicenses, updateLicenseStatus } from "./license-core.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const keyPath = process.env.BRATEC_LICENSE_PRIVATE_KEY;
const registryPath = process.env.BRATEC_LICENSE_REGISTRY;
const outputDirectory = process.env.BRATEC_LICENSE_OUTPUT;
if (!keyPath || !registryPath || !outputDirectory) throw new Error("Configure BRATEC_LICENSE_PRIVATE_KEY, BRATEC_LICENSE_REGISTRY e BRATEC_LICENSE_OUTPUT.");
const port = Number(process.env.BRATEC_LICENSE_PORT || 47831);

function json(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" });
  response.end(JSON.stringify(body));
}
async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 32_768) throw new Error("Solicitação muito grande.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/") {
      response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      response.end(readFileSync(join(here, "index.html")));
      return;
    }
    if (request.method === "GET" && request.url === "/api/licenses") return json(response, 200, listLicenses(registryPath));
    if (request.method === "POST" && request.url === "/api/licenses") return json(response, 201, issueLicense({ ...(await body(request)), keyPath, registryPath, outputDirectory }));
    if (request.method === "PATCH" && request.url?.startsWith("/api/licenses/")) {
      const licenseId = decodeURIComponent(request.url.slice("/api/licenses/".length));
      return json(response, 200, updateLicenseStatus(registryPath, licenseId, (await body(request)).status));
    }
    json(response, 404, { error: "Não encontrado." });
  } catch (error) {
    json(response, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}).listen(port, "127.0.0.1", () => process.stdout.write(`Gerador BratecInfo disponível somente em http://127.0.0.1:${port}\n`));
