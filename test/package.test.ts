import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

type ResourceKind = "extensions" | "skills" | "prompts" | "themes";

type PackageManifest = {
  files: string[];
  keywords: string[];
  pi: Partial<Record<ResourceKind, string[]>>;
  scripts: Record<string, string>;
};

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(repositoryRoot, "package.json"), "utf8")) as PackageManifest;

test("declares intentional Pi resources that exist", () => {
  expect(packageJson.keywords).toContain("pi-package");
  expect(packageJson.pi).toBeDefined();

  for (const [resourceKind, entries] of Object.entries(packageJson.pi)) {
    expect(entries, `${resourceKind} manifest entries`).not.toHaveLength(0);

    for (const entry of entries ?? []) {
      expect(existsSync(resolve(repositoryRoot, entry)), `${resourceKind}: ${entry}`).toBe(true);
    }
  }
});

test("ships each declared resource directory deliberately", () => {
  const files = new Set(packageJson.files);

  for (const resourceKind of Object.keys(packageJson.pi)) {
    expect(files).toContain(resourceKind);
  }
});

test("uses the standard local quality gates", () => {
  expect(packageJson.scripts.check).toBe("biome check --write --error-on-warnings .");
  expect(packageJson.scripts["check:ci"]).toBe("biome check --error-on-warnings .");
  expect(packageJson.scripts.typecheck).toBe("tsc --noEmit");
  expect(packageJson.scripts.test).toBe("vitest run");
  expect(packageJson.scripts["test:coverage"]).toBe("vitest run --coverage");
  expect(packageJson.scripts.prepare).toBe("node scripts/install-prek-hook.mjs");
  expect(existsSync(resolve(repositoryRoot, "scripts", "install-prek-hook.mjs"))).toBe(true);

  const biomeConfig = JSON.parse(readFileSync(resolve(repositoryRoot, "biome.json"), "utf8")) as {
    formatter: { indentStyle: string; indentWidth: number };
    linter: { enabled: boolean; rules: { recommended: boolean } };
  };

  expect(biomeConfig).toMatchObject({
    formatter: { indentStyle: "space", indentWidth: 2 },
    linter: { enabled: true, rules: { recommended: true } },
  });
});
