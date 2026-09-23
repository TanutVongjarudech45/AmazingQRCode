import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const git = (...args) =>
  execFileSync("git", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
const patterns = [
  /hf_[A-Za-z0-9]{20,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /NEXT_PUBLIC_[A-Z0-9_]*(?:HF|HUGGING)[A-Z0-9_]*TOKEN\s*[:=]\s*["'][^"'\r\n]+["']/,
];
const unsafeEnv = (file) =>
  /(^|\/)\.env(?:\.|$)/.test(file) && file !== ".env.example";
const failures = new Set();
function inspect(file, content) {
  if (unsafeEnv(file))
    failures.add(`${file}: environment file must not be tracked`);
  if (
    !content.includes("\0") &&
    patterns.some((pattern) => pattern.test(content))
  ) {
    failures.add(`${file}: possible credential (value redacted)`);
  }
}

if (process.argv.includes("--history")) {
  for (const revision of git("rev-list", "--all")
    .trim()
    .split("\n")
    .filter(Boolean)) {
    const files = git("ls-tree", "-r", "--name-only", "-z", revision)
      .split("\0")
      .filter(Boolean);
    for (const file of files)
      inspect(`${file}`, git("show", `${revision}:${file}`));
  }
} else {
  // Inspect the index, not just working files: unstaged cleanup must not hide a staged secret.
  const indexed = git("ls-files", "-z").split("\0").filter(Boolean);
  for (const file of indexed) inspect(file, git("show", `:${file}`));
  if (!process.argv.includes("--staged")) {
    const working = git(
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    )
      .split("\0")
      .filter(Boolean);
    for (const file of new Set(working))
      if (existsSync(file)) inspect(file, readFileSync(file, "utf8"));
  }
}
if (failures.size) {
  console.error(
    "Secret check failed. Remove credentials from Git before continuing.",
  );
  for (const message of failures) console.error(message);
  process.exitCode = 1;
} else
  console.log(
    "Secret check passed; no environment files or recognized credentials found.",
  );
