#!/usr/bin/env node
// Public deployment verification. Not a replacement for visual/browser QA.
const [baseInput, expectedSha] = process.argv.slice(2);
if (!baseInput || !expectedSha || !/^[0-9a-f]{40}$/i.test(expectedSha)) {
  console.error("Usage: npm run deploy:check -- https://project.vercel.app <full-40-character-sha>");
  process.exit(2);
}
let base;
try {
  base = new URL(baseInput);
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw Error("invalid target");
} catch {
  console.error("Pass a public HTTPS deployment URL without credentials/query/fragment.");
  process.exit(2);
}
base.pathname = base.pathname.replace(/\/$/, "") + "/";
const routes = ["/", "/story", "/graph", "/api/deployment-info"];
let failures = 0;
for (const path of routes) {
  const url = new URL(path.slice(1), base);
  try {
    const resp = await fetch(url, {redirect:"follow",signal:AbortSignal.timeout(15000),headers:{"accept":"text/html,application/json"}});
    const body = await resp.text();
    const redirected = new URL(resp.url);
    const protectedRoute = /vercel\.com\/(login|sso)|vercel authentication|authentication required|sign in to vercel/i.test(resp.url + " " + body.slice(0,2000));
    if (!resp.ok || protectedRoute || redirected.origin !== base.origin) {
      console.error("FAIL", path, "status",resp.status,"redirect",resp.url,"protected",protectedRoute);
      failures++; continue;
    }
    if (path === "/api/deployment-info") {
      let info;
      try {info = JSON.parse(body)}catch {throw Error("not JSON")};
      if (info.gitCommitSha !== expectedSha) {
        console.error("FAIL commit mismatch: expected",expectedSha,"observed",info.gitCommitSha || "missing");failures++;
      } else if (info.gitRepoOwner && info.gitRepoOwner.toLowerCase() !== "harshsinha-12") {
        console.error("FAIL unexpected deployed repository owner:",info.gitRepoOwner);failures++;
      } else if (info.gitRepo && info.gitRepo.toLowerCase() !== "kaam-ki-baat") {
        console.error("FAIL unexpected deployed repository:",info.gitRepo);failures++;
      } else {
        console.log("PASS",path,"SHA",info.gitCommitSha,"origin",info.gitRepoOwner+"/"+info.gitRepo);
      }
    } else if (!/Kaam Ki Baat/i.test(body)) {
      console.error("FAIL",path,"did not render recognizable app content");failures++;
    } else {
      console.log("PASS",path,"HTTP",resp.status);
    }
  } catch (error) {
    console.error("FAIL",path,String(error));failures++;
  }
}
if (failures) {
  console.error(`Deployment checks failed (${failures}). Do not claim public availability or animation correctness.`);
  process.exit(1);
}
console.log("HTTP and source-parity checks passed. Run separate visual animation QA before publishing live claims.");
