import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Static, Type } from "typebox";
import { Value } from "typebox/value";
import { expect, test } from "vitest";

const resourceManifestSchema = Type.Partial(
  Type.Object({
    extensions: Type.Array(Type.String()),
    skills: Type.Array(Type.String()),
    prompts: Type.Array(Type.String()),
    themes: Type.Array(Type.String()),
  }),
);

type ResourceManifest = Static<typeof resourceManifestSchema>;
type ResourceKind = keyof ResourceManifest;

const packageManifestSchema = Type.Object({
  files: Type.Array(Type.String()),
  keywords: Type.Array(Type.String()),
  pi: Type.Object({}),
  scripts: Type.Record(Type.String(), Type.String()),
});

type PackageManifestJson = Static<typeof packageManifestSchema>;
type PackageManifest = Omit<PackageManifestJson, "pi"> & { pi: ResourceManifest };

const biomeConfigSchema = Type.Object({
  formatter: Type.Object({ indentStyle: Type.String(), indentWidth: Type.Number() }),
  linter: Type.Object({ enabled: Type.Boolean(), rules: Type.Object({ recommended: Type.Boolean() }) }),
});

type BiomeConfig = Static<typeof biomeConfigSchema>;

function decodeResourceManifest(value: PackageManifestJson["pi"]): ResourceManifest {
  if (!Value.Check(resourceManifestSchema, value)) {
    throw new Error("Expected Pi resource manifest fields used by package tests");
  }
  return {
    extensions: value.extensions,
    skills: value.skills,
    prompts: value.prompts,
    themes: value.themes,
  };
}

function decodePackageManifest(json: string): PackageManifest {
  const value = JSON.parse(json);
  if (!Value.Check(packageManifestSchema, value)) {
    throw new Error("Expected package manifest fields used by package tests");
  }
  return { ...value, pi: decodeResourceManifest(value.pi) };
}

function decodeBiomeConfig(json: string): BiomeConfig {
  const value = JSON.parse(json);
  if (!Value.Check(biomeConfigSchema, value)) {
    throw new Error("Expected Biome config fields used by package tests");
  }
  return value;
}

const resourceKinds: ResourceKind[] = ["extensions", "skills", "prompts", "themes"];

function resourceEntries(manifest: ResourceManifest): Array<[ResourceKind, string[]]> {
  const entries: Array<[ResourceKind, string[]]> = [];
  for (const resourceKind of resourceKinds) {
    const paths = manifest[resourceKind];
    if (paths) entries.push([resourceKind, paths]);
  }
  return entries;
}

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = decodePackageManifest(readFileSync(resolve(repositoryRoot, "package.json"), "utf8"));

test("rejects incomplete and malformed package resource manifests", () => {
  expect(() => decodePackageManifest("{}")).toThrow("Expected package manifest fields used by package tests");
  expect(() => decodePackageManifest('{"files":[],"keywords":[],"pi":{"extensions":[false]},"scripts":{}}')).toThrow(
    "Expected Pi resource manifest fields used by package tests",
  );
});

test("ignores non-resource Pi metadata", () => {
  const manifest = decodePackageManifest(
    '{"files":[],"keywords":[],"pi":{"extensions":["./extensions"],"image":"preview.png"},"scripts":{}}',
  );

  expect(resourceEntries(manifest.pi)).toEqual([["extensions", ["./extensions"]]]);
});

test("declares intentional Pi resources that exist", () => {
  expect(packageJson.keywords).toContain("pi-package");

  for (const [resourceKind, entries] of resourceEntries(packageJson.pi)) {
    expect(entries, `${resourceKind} manifest entries`).not.toHaveLength(0);

    for (const entry of entries) {
      expect(existsSync(resolve(repositoryRoot, entry)), `${resourceKind}: ${entry}`).toBe(true);
    }
  }
});

test("ships each declared resource directory deliberately", () => {
  const files = new Set(packageJson.files);

  for (const [resourceKind] of resourceEntries(packageJson.pi)) {
    expect(files).toContain(resourceKind);
  }
});

test("uses the standard local quality gates", () => {
  expect(packageJson.scripts.check).toBe("biome check --write --error-on-warnings .");
  expect(packageJson.scripts["check:ci"]).toBe("biome check --error-on-warnings .");
  expect(packageJson.scripts.typecheck).toBe("tsc --noEmit");
  expect(packageJson.scripts["lint:anti-slop"]).toBe("oxlint --config oxlint.config.ts -A all extensions test scripts");
  expect(packageJson.scripts.verify).toBe(
    "npm run check:ci && npm run typecheck && npm run lint:anti-slop && npm test",
  );
  expect(packageJson.scripts.test).toBe("vitest run");
  expect(packageJson.scripts["test:coverage"]).toBe("vitest run --coverage");
  expect(packageJson.scripts.prepare).toBe("node scripts/install-prek-hook.mjs");
  expect(existsSync(resolve(repositoryRoot, "scripts", "install-prek-hook.mjs"))).toBe(true);

  const biomeConfig = decodeBiomeConfig(readFileSync(resolve(repositoryRoot, "biome.json"), "utf8"));

  expect(biomeConfig).toMatchObject({
    formatter: { indentStyle: "space", indentWidth: 2 },
    linter: { enabled: true, rules: { recommended: true } },
  });
});
