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

interface PackageInfo {
  readonly name: string;
  readonly path: string;
}

const violations: Violation[] = [];

const packages = await discoverPackages(PACKAGE_ROOT);

for (const { name: packageName, path: packagePath } of packages) {
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
      checkPostgresImportBoundary(packageName, packagePath, file, specifier);
    }
  }
}

for (const packageName of Object.keys(ALLOWED_RUNTIME_DEPS)) {
  if (!packages.some((info) => info.name === packageName)) {
    violations.push({
      file: PACKAGE_ROOT,
      specifier: packageName,
      message: "Package from graph policy was not found",
    });
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

async function discoverPackages(root: string): Promise<PackageInfo[]> {
  const packages: PackageInfo[] = [];

  for await (const dir of walkDirectories(root)) {
    const manifestPath = `${dir}/deno.json`;

    try {
      const manifestText = await Deno.readTextFile(manifestPath);
      const manifest = JSON.parse(manifestText) as { readonly name?: unknown };

      if (typeof manifest.name !== "string") {
        continue;
      }

      if (!manifest.name.startsWith("@rootware/")) {
        continue;
      }

      packages.push({
        name: manifest.name.slice("@rootware/".length),
        path: dir,
      });
    } catch (error) {
      if (error instanceof Deno.errors.NotFound) {
        continue;
      }

      throw error;
    }
  }

  return packages.sort((a, b) => a.name.localeCompare(b.name));
}

async function* walkDirectories(dir: string): AsyncGenerator<string> {
  yield dir;

  for await (const entry of Deno.readDir(dir)) {
    if (entry.isDirectory) {
      yield* walkDirectories(`${dir}/${entry.name}`);
    }
  }
}

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

function checkPostgresImportBoundary(
  packageName: string,
  packagePath: string,
  file: string,
  specifier: string,
): void {
  if (
    isPostgresDriverSpecifier(specifier) &&
    !isPostgresAdapterFile(packageName, packagePath, file)
  ) {
    violations.push({
      file,
      specifier,
      message:
        "PostgreSQL driver imports are only allowed inside orm/postgres and migrate/postgres",
    });
  }

  if (!isPostgresProtectedFile(packageName, packagePath, file)) {
    return;
  }

  if (referencesPostgresSubpath(file, specifier)) {
    violations.push({
      file,
      specifier,
      message:
        "Root, core, and schema modules must not import PostgreSQL adapter code",
    });
  }
}

function isPostgresAdapterFile(
  packageName: string,
  packagePath: string,
  file: string,
): boolean {
  return (packageName === "orm" || packageName === "migrate") &&
    file.startsWith(`${packagePath}/postgres/`);
}

function isPostgresDriverSpecifier(specifier: string): boolean {
  return specifier === "jsr:@db/postgres" ||
    specifier.startsWith("jsr:@db/postgres@") ||
    specifier === "@db/postgres";
}

function isPostgresProtectedFile(
  packageName: string,
  packagePath: string,
  file: string,
): boolean {
  if (packageName === "schema") {
    return file.startsWith(`${packagePath}/`) && file.endsWith(".ts");
  }

  if (packageName !== "orm" && packageName !== "migrate") {
    return false;
  }

  return file === `${packagePath}/mod.ts` ||
    file.startsWith(`${packagePath}/core/`);
}

function referencesPostgresSubpath(file: string, specifier: string): boolean {
  if (specifier.includes("/postgres")) {
    return true;
  }

  if (!specifier.startsWith(".")) {
    return false;
  }

  const base = file.slice(0, file.lastIndexOf("/") + 1);
  const resolved = new URL(specifier, `file://${Deno.cwd()}/${base}`).pathname;
  const relative = resolved.slice(`${Deno.cwd()}/`.length);

  return relative.includes("/postgres/");
}
