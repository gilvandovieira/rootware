const PACKAGE_ROOT = "packages";

const ALLOWED_RUNTIME_DEPS: Record<string, readonly string[]> = {
  errors: [],
  env: ["errors"],
  log: ["errors"],
  testing: ["errors", "env", "log"],
  http: ["errors", "log"],
  cache: ["errors", "log"],
  storage: ["errors", "log"],
  session: ["errors", "cache", "log"],
  schema: [],
  migrate: ["errors", "log", "schema"],
  orm: ["errors", "log", "schema"],
  jobs: ["errors", "log"],
};

interface Violation {
  readonly file: string;
  readonly specifier: string;
  readonly message: string;
}

const violations: Violation[] = [];

for await (const packageEntry of Deno.readDir(PACKAGE_ROOT)) {
  if (!packageEntry.isDirectory) {
    continue;
  }

  const packageName = packageEntry.name;
  const packagePath = `${PACKAGE_ROOT}/${packageName}`;

  if (!(packageName in ALLOWED_RUNTIME_DEPS)) {
    violations.push({
      file: packagePath,
      specifier: packageName,
      message: "Package is missing from graph policy",
    });
    continue;
  }

  for await (const file of walkTsFiles(packagePath)) {
    const source = await Deno.readTextFile(file);

    for (const specifier of findImportSpecifiers(source)) {
      checkRootwareImport(packageName, file, specifier);
      checkRelativeImportBoundary(packagePath, file, specifier);
    }
  }
}

if (violations.length > 0) {
  console.error("Rootware package graph violations:");

  for (const violation of violations) {
    console.error(
      `- ${violation.file}: ${violation.specifier} — ${violation.message}`,
    );
  }

  Deno.exit(1);
}

console.log("Rootware package graph OK");

async function* walkTsFiles(dir: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}/${entry.name}`;

    if (entry.isDirectory) {
      yield* walkTsFiles(path);
      continue;
    }

    if (entry.isFile && entry.name.endsWith(".ts")) {
      yield path;
    }
  }
}

function findImportSpecifiers(source: string): string[] {
  const specifiers = new Set<string>();
  const staticImport =
    /\b(?:import|export)\s+(?:type\s+)?(?:[^'"]*?\s+from\s*)?["']([^"']+)["']/g;
  const dynamicImport = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;

  for (const match of source.matchAll(staticImport)) {
    specifiers.add(match[1]);
  }

  for (const match of source.matchAll(dynamicImport)) {
    specifiers.add(match[1]);
  }

  return [...specifiers];
}

function checkRootwareImport(
  packageName: string,
  file: string,
  specifier: string,
): void {
  if (!specifier.startsWith("@rootware/")) {
    return;
  }

  const importedPackage = specifier.slice("@rootware/".length).split("/")[0];

  if (importedPackage === packageName) {
    return;
  }

  const allowed = ALLOWED_RUNTIME_DEPS[packageName] ?? [];
  const isTestFile = file.endsWith("_test.ts") || file.endsWith(".test.ts");
  const testAllowed = isTestFile && importedPackage === "testing";

  if (!allowed.includes(importedPackage) && !testAllowed) {
    violations.push({
      file,
      specifier,
      message: `Allowed dependencies for ${packageName}: ${
        allowed.length === 0 ? "(none)" : allowed.join(", ")
      }`,
    });
  }
}

function checkRelativeImportBoundary(
  packagePath: string,
  file: string,
  specifier: string,
): void {
  if (!specifier.startsWith(".")) {
    return;
  }

  const base = file.slice(0, file.lastIndexOf("/") + 1);
  const resolved = new URL(specifier, `file://${Deno.cwd()}/${base}`).pathname;
  const relative = resolved.slice(`${Deno.cwd()}/`.length);

  if (
    relative !== packagePath &&
    !relative.startsWith(`${packagePath}/`) &&
    relative.startsWith(`${PACKAGE_ROOT}/`)
  ) {
    violations.push({
      file,
      specifier,
      message: "Relative import escapes the package boundary",
    });
  }
}
