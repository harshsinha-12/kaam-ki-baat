// A loopback-only entry for the explicitly prepared synthetic demo. It serves
// one HTML button, never the directory containing credentials or environment.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";

const environment = await readFile("data/private/browser-demo/server.env", "utf8");
const snapshotFile = environment.split("\n").find(line => line.startsWith("KKB_SNAPSHOT="))?.slice("KKB_SNAPSHOT=".length);
assert.ok(snapshotFile);
assert.equal(JSON.parse(await readFile(snapshotFile, "utf8")).label, "FIXTURE");
const entry = await readFile("data/private/browser-demo/start.html");
createServer((req, res) => {
  if (req.method !== "GET" || req.url !== "/" || !["localhost:3136", "127.0.0.1:3136"].includes(req.headers.host ?? "")) {
    res.writeHead(404).end(); return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'" });
  res.end(entry);
}).listen(3136, "127.0.0.1", () => console.log("Prepared local demo entry: http://localhost:3136 (fixture only; no voice call)"));
