import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const executableName = process.platform === "win32" ? "prek.cmd" : "prek";
const prek = resolve(repositoryRoot, "node_modules", ".bin", executableName);

// Pi installs Git packages with production dependencies. Hook installation is
// a development concern, so do nothing when Prek was deliberately omitted.
if (!existsSync(prek)) process.exit(0);

const result = spawnSync(prek, ["install"], {
  cwd: repositoryRoot,
  encoding: "utf8",
});

if (result.status !== 0) {
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  process.exit(result.status ?? 1);
}
