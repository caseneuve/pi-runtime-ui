import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function walkTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkTsFiles(full));
      continue;
    }
    if (full.endsWith(".ts")) out.push(full);
  }
  return out;
}

function ownersOf(apiName: string): string[] {
  return walkTsFiles(resolve(repositoryRoot, "extensions"))
    .filter((file) => readFileSync(file, "utf8").includes(`${apiName}(`))
    .map((file) => relative(repositoryRoot, file));
}

describe("runtime UI ownership", () => {
  it("keeps setEditorComponent ownership in editor-status only", () => {
    expect(ownersOf("setEditorComponent")).toEqual(["extensions/editor-status.ts"]);
  });

  it("keeps setFooter ownership in runtime-footer only", () => {
    expect(ownersOf("setFooter")).toEqual(["extensions/runtime-footer.ts"]);
  });
});
