import fs from "node:fs";
import path from "node:path";

function loadDotEnv(filePath) {
  const env = {};
  if (!fs.existsSync(filePath)) return env;
  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    env[key] = val;
  }
  return env;
}

function getBaseUrls() {
  const cwd = process.cwd();
  const envPath = path.join(cwd, ".env");
  const fileEnv = loadDotEnv(envPath);
  const api = process.env.VITE_API_URL || fileEnv.VITE_API_URL || "http://localhost:8000/api";
  const ml = process.env.VITE_ML_API_URL || fileEnv.VITE_ML_API_URL || api;
  // On some Windows setups, Node fetch resolves localhost to IPv6 (::1) while backend listens on 127.0.0.1.
  const normalize = (u) => u.replace("://localhost", "://127.0.0.1").replace(/\/+$/, "");
  return { apiBase: normalize(api), mlBase: normalize(ml) };
}

async function fetchJson(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      return { ok: false, status: res.status, text: await res.text() };
    }
    const json = await res.json();
    return { ok: true, status: res.status, json };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

async function main() {
  const { apiBase, mlBase } = getBaseUrls();
  const checks = [
    { name: "API Health", url: `${apiBase}/health` },
    { name: "VDS Suggest (1-char)", url: `${apiBase}/vds/suggest?q=B&limit=15` },
    { name: "VDS Suggest (full)", url: `${apiBase}/vds/suggest?q=BFWTA1R&limit=15` },
    { name: "ML Flat Predict", url: `${mlBase}/ml/predict/BFWTA1R/flat` },
  ];

  console.log("Running preflight checks...");
  console.log(`API base: ${apiBase}`);
  console.log(`ML base:  ${mlBase}`);

  let failed = false;
  for (const check of checks) {
    const result = await fetchJson(check.url);
    if (!result.ok) {
      failed = true;
      console.error(`FAIL  ${check.name}: ${check.url}`);
      if (result.status) console.error(`  Status: ${result.status}`);
      if (result.error) console.error(`  Error: ${result.error}`);
      if (result.text) console.error(`  Body: ${result.text.slice(0, 240)}`);
      continue;
    }
    console.log(`PASS  ${check.name}: ${check.url} (HTTP ${result.status})`);
  }

  if (failed) {
    console.error("");
    console.error("Preflight failed. Start/fix backend and retry.");
    process.exit(1);
  }

  console.log("");
  console.log("All preflight checks passed.");
}

main();
