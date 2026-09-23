import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const scanner = resolve("scripts/check-secrets.mjs");

test("blocks staged secrets even when removed from the working file, without printing values", () => {
  const cwd = mkdtempSync(join(tmpdir(), "speakcode-secrets-"));
  try {
    const git = (...args) => execFileSync("git", args, { cwd, stdio: "pipe" });
    const scan = (...args) =>
      spawnSync(process.execPath, [scanner, ...args], {
        cwd,
        encoding: "utf8",
      });
    git("init", "-q");
    writeFileSync(join(cwd, ".gitignore"), ".env*\n!.env.example\n");
    writeFileSync(join(cwd, ".env.example"), "HF_TOKEN=\n");
    writeFileSync(join(cwd, ".env.local"), "HF_TOKEN=local-only\n");
    git("add", ".gitignore", ".env.example");
    assert.equal(scan().status, 0);
    const token = "hf_" + "fake".repeat(10);
    writeFileSync(join(cwd, "config.ts"), `const token = '${token}';`);
    git("add", "config.ts");
    writeFileSync(join(cwd, "config.ts"), "// cleaned working copy");
    const result = scan("--staged");
    assert.equal(result.status, 1);
    assert.match(result.stderr, /config.ts/);
    assert.equal(result.stderr.includes(token), false);
    git("rm", "--cached", "-f", "config.ts");
    git("add", "-f", ".env.local");
    assert.equal(scan("--staged").status, 1);
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
