import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
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
  dependencies: Type.Optional(Type.Record(Type.String(), Type.String())),
  peerDependencies: Type.Optional(Type.Record(Type.String(), Type.String())),
  devDependencies: Type.Optional(Type.Record(Type.String(), Type.String())),
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

test("declares intentional in-package resources covered by the files allowlist", () => {
  expect(packageJson.keywords).toContain("pi-package");
  expect(resourceEntries(packageJson.pi).length).toBeGreaterThan(0);

  for (const [resourceKind, entries] of resourceEntries(packageJson.pi)) {
    expect(entries, `${resourceKind} manifest entries`).not.toHaveLength(0);

    for (const entry of entries) {
      const pathname = resolve(repositoryRoot, entry);
      const local = relative(repositoryRoot, pathname);
      expect(isAbsolute(entry)).toBe(false);
      expect(local.startsWith("..")).toBe(false);
      expect(existsSync(pathname), `${resourceKind}: ${entry}`).toBe(true);
      expect(
        packageJson.files.some((file) => local === file || local.startsWith(`${file}${sep}`)),
        `files must cover ${entry}`,
      ).toBe(true);
    }
  }
});

test("ships each declared resource directory deliberately", () => {
  const files = new Set(packageJson.files);

  for (const [resourceKind] of resourceEntries(packageJson.pi)) {
    expect(files).toContain(resourceKind);
  }
});

test("keeps host APIs out of runtime dependencies and uses host peers only where imported", () => {
  for (const host of [
    "@earendil-works/pi-coding-agent",
    "@earendil-works/pi-agent-core",
    "@earendil-works/pi-ai",
    "@earendil-works/pi-tui",
    "typebox",
  ]) {
    expect(packageJson.dependencies?.[host]).toBeUndefined();

    if (packageJson.peerDependencies?.[host]) {
      expect(packageJson.peerDependencies[host]).toBe("*");
      expect(packageJson.devDependencies?.[host]).toMatch(/^\d+\.\d+\.\d+$/);
    }
  }

  // TypeBox is a metadata-test dependency, not an extension import.
  expect(packageJson.peerDependencies?.typebox).toBeUndefined();
});

test.each(["", "**/.pi\n"])("allows shared Pi docs but excludes local state with global ignores %j", (globalIgnore) => {
  const root = mkdtempSync(resolve(tmpdir(), "runtime-ui-ignore-"));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: resolve(root, "empty-gitconfig"), GIT_CONFIG_NOSYSTEM: "1" };

  const git = (...args: string[]) =>
    execFileSync("git", ["-c", `core.excludesFile=${resolve(root, "global-ignore")}`, ...args], {
      cwd: root,
      env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

  try {
    writeFileSync(resolve(root, "empty-gitconfig"), "");
    writeFileSync(resolve(root, "global-ignore"), globalIgnore);
    writeFileSync(resolve(root, ".gitignore"), readFileSync(resolve(repositoryRoot, ".gitignore")));
    mkdirSync(resolve(root, ".pi/docs"), { recursive: true });
    mkdirSync(resolve(root, ".pi/state"));
    mkdirSync(resolve(root, "nested/.pi"), { recursive: true });
    writeFileSync(resolve(root, "nested/.pi/settings.json"), "fixture");

    for (const file of ["docs/shared.md", "settings.json", "mcp.json", "state/cache.json"]) {
      writeFileSync(resolve(root, ".pi", file), "fixture");
    }

    git("init", "-q");
    git("add", ".pi/docs/shared.md");
    expect(git("ls-files").trim()).toBe(".pi/docs/shared.md");

    for (const file of ["settings.json", "mcp.json", "state/cache.json"]) {
      expect(git("check-ignore", "--no-index", `.pi/${file}`).trim()).toBe(`.pi/${file}`);
    }

    if (globalIgnore) {
      expect(git("check-ignore", "--no-index", "nested/.pi/settings.json").trim()).toBe("nested/.pi/settings.json");
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("provides portable development gates and the guarded lifecycle helper", () => {
  for (const gate of ["check", "check:ci", "typecheck", "test", "test:coverage", "verify", "pack:check", "prepare"]) {
    expect(packageJson.scripts[gate]).toBeTypeOf("string");
    expect(packageJson.scripts[gate].length).toBeGreaterThan(0);
  }

  expect(Object.values(packageJson.scripts).join(" ")).not.toMatch(/oxlint|anti-slop|\/home\//);
  expect(existsSync(resolve(repositoryRoot, "scripts", "install-prek-hook.mjs"))).toBe(true);

  const biomeConfig = decodeBiomeConfig(readFileSync(resolve(repositoryRoot, "biome.json"), "utf8"));

  expect(biomeConfig).toMatchObject({
    formatter: { indentStyle: "space", indentWidth: 2 },
    linter: { enabled: true, rules: { recommended: true } },
  });
});
