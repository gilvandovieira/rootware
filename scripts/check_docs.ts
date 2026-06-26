interface PackageConfig {
  readonly name?: string;
  readonly exports?: string | Record<string, unknown>;
}

interface DocLocation {
  readonly filename: string;
  readonly line: number;
}

interface DocDeclaration {
  readonly declarationKind?: string;
  readonly kind?: string;
  readonly jsDoc?: {
    readonly doc?: string;
  };
  readonly location?: DocLocation;
}

interface DocSymbol {
  readonly name: string;
  readonly declarations?: readonly DocDeclaration[];
}

interface DocNode {
  readonly symbols?: readonly DocSymbol[];
}

interface DenoDocJson {
  readonly nodes?: Record<string, DocNode>;
}

interface DocEntry {
  readonly packageName: string;
  readonly exportName: string;
  readonly label: string;
  readonly path: string;
}

interface EntryCoverage {
  readonly entry: DocEntry;
  readonly total: number;
  readonly documented: number;
  readonly missing: readonly MissingDoc[];
}

interface MissingDoc {
  readonly label: string;
  readonly symbol: string;
  readonly kind: string;
  readonly path?: string;
  readonly line?: number;
}

const DEFAULT_MINIMUM_PERCENT = 80;
const textDecoder = new TextDecoder();

const options = parseArgs(Deno.args);
const entries = await discoverDocEntries();
const coverages: EntryCoverage[] = [];

for (const entry of entries) {
  coverages.push(await checkEntry(entry));
}

const total = sum(coverages.map((coverage) => coverage.total));
const documented = sum(coverages.map((coverage) => coverage.documented));
const percent = total === 0 ? 100 : (documented / total) * 100;
const minimumPercent = options.minimumPercent;
const entryMinimumPercent = options.entryMinimumPercent;
const missing = coverages.flatMap((coverage) => coverage.missing);
const lowEntries = coverages.filter((coverage) =>
  percentage(coverage.documented, coverage.total) < entryMinimumPercent
);

if (options.json) {
  console.log(JSON.stringify(
    {
      minimumPercent,
      entryMinimumPercent,
      percent,
      total,
      documented,
      missing: missing.length,
      entries: coverages.map((coverage) => ({
        packageName: coverage.entry.packageName,
        exportName: coverage.entry.exportName,
        label: coverage.entry.label,
        path: coverage.entry.path,
        total: coverage.total,
        documented: coverage.documented,
        percent: percentage(coverage.documented, coverage.total),
        missing: coverage.missing,
      })),
    },
    null,
    2,
  ));
} else {
  console.log(
    `Documentation coverage: ${formatPercent(percent)} ` +
      `(${documented}/${total}), minimum ${formatPercent(minimumPercent)}, ` +
      `entry minimum ${formatPercent(entryMinimumPercent)}`,
  );

  for (const coverage of coverages) {
    console.log(
      `${coverage.entry.label.padEnd(32)} ` +
        `${formatPercent(percentage(coverage.documented, coverage.total))} ` +
        `(${coverage.documented}/${coverage.total})`,
    );
  }

  if (options.listMissing || percent < minimumPercent) {
    const limit = percent < minimumPercent ? 100 : missing.length;
    const visible = missing.slice(0, limit);

    if (visible.length > 0) {
      console.log("");
      console.log("Missing JSDoc:");
      for (const item of visible) {
        const location = item.path === undefined
          ? ""
          : ` ${item.path}${item.line === undefined ? "" : `:${item.line}`}`;
        console.log(`- ${item.label} ${item.symbol} (${item.kind})${location}`);
      }
    }

    if (missing.length > visible.length) {
      console.log(`... ${missing.length - visible.length} more missing docs`);
    }
  } else if (missing.length > 0) {
    console.log(`Missing JSDoc: ${missing.length} exported symbols`);
  }

  if (lowEntries.length > 0) {
    console.log("");
    console.log("Entries below minimum:");
    for (const coverage of lowEntries) {
      console.log(
        `- ${coverage.entry.label}: ` +
          `${formatPercent(percentage(coverage.documented, coverage.total))}`,
      );
    }
  }
}

if (percent < minimumPercent || lowEntries.length > 0) {
  console.error("Documentation coverage is below the configured minimum.");
  Deno.exit(1);
}

function parseArgs(args: readonly string[]): {
  readonly minimumPercent: number;
  readonly entryMinimumPercent: number;
  readonly json: boolean;
  readonly listMissing: boolean;
} {
  let minimumPercent = DEFAULT_MINIMUM_PERCENT;
  let entryMinimumPercent = DEFAULT_MINIMUM_PERCENT;
  let json = false;
  let listMissing = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === "--json") {
      json = true;
      continue;
    }

    if (arg === "--list-missing") {
      listMissing = true;
      continue;
    }

    if (arg === "--min") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new Error("--min requires a value");
      }
      minimumPercent = parseMinimumPercent(value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--min=")) {
      minimumPercent = parseMinimumPercent(arg.slice("--min=".length));
      continue;
    }

    if (arg === "--entry-min") {
      const value = args[index + 1];
      if (value === undefined) {
        throw new Error("--entry-min requires a value");
      }
      entryMinimumPercent = parseMinimumPercent(value);
      index += 1;
      continue;
    }

    if (arg.startsWith("--entry-min=")) {
      entryMinimumPercent = parseMinimumPercent(
        arg.slice("--entry-min=".length),
      );
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { minimumPercent, entryMinimumPercent, json, listMissing };
}

async function discoverDocEntries(): Promise<DocEntry[]> {
  const entries: DocEntry[] = [];

  for await (const group of Deno.readDir("packages")) {
    if (!group.isDirectory) {
      continue;
    }

    const groupPath = `packages/${group.name}`;

    for await (const packageDir of Deno.readDir(groupPath)) {
      if (!packageDir.isDirectory) {
        continue;
      }

      const packagePath = `${groupPath}/${packageDir.name}`;
      const configPath = `${packagePath}/deno.json`;
      const config = JSON.parse(
        await Deno.readTextFile(configPath),
      ) as PackageConfig;

      if (typeof config.name !== "string") {
        throw new Error(`${configPath} is missing a package name`);
      }

      for (const packageExport of getPackageExports(config.exports)) {
        entries.push({
          packageName: config.name,
          exportName: packageExport.name,
          label: packageExport.name === "."
            ? config.name
            : `${config.name}${packageExport.name.slice(1)}`,
          path: resolvePackageExport(packagePath, packageExport.path),
        });
      }
    }
  }

  return entries.sort((a, b) => a.label.localeCompare(b.label));
}

function getPackageExports(
  exportsField: PackageConfig["exports"],
): Array<{ readonly name: string; readonly path: string }> {
  if (typeof exportsField === "string") {
    return [{ name: ".", path: exportsField }];
  }

  if (exportsField === undefined || exportsField === null) {
    return [];
  }

  return Object.entries(exportsField)
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .map(([name, path]) => ({ name, path }));
}

function resolvePackageExport(packagePath: string, exportPath: string): string {
  if (!exportPath.startsWith("./")) {
    throw new Error(`Package export path must be relative: ${exportPath}`);
  }

  return `${packagePath}/${exportPath.slice(2)}`;
}

async function checkEntry(entry: DocEntry): Promise<EntryCoverage> {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["doc", "--json", entry.path],
    clearEnv: true,
    stdout: "piped",
    stderr: "piped",
  });
  const output = await command.output();

  if (!output.success) {
    const stderr = textDecoder.decode(output.stderr).trim();
    throw new Error(`deno doc failed for ${entry.label}: ${stderr}`);
  }

  const doc = JSON.parse(textDecoder.decode(output.stdout)) as DenoDocJson;
  let total = 0;
  let documented = 0;
  const missing: MissingDoc[] = [];

  for (const node of Object.values(doc.nodes ?? {})) {
    for (const symbol of node.symbols ?? []) {
      const declarations = (symbol.declarations ?? [])
        .filter((declaration) => declaration.declarationKind === "export");

      if (declarations.length === 0) {
        continue;
      }

      total += 1;

      if (declarations.some(hasJsDoc)) {
        documented += 1;
        continue;
      }

      const declaration = declarations[0];
      const location = declaration.location;
      missing.push({
        label: entry.label,
        symbol: symbol.name,
        kind: declaration.kind ?? "unknown",
        path: location?.filename === undefined
          ? undefined
          : pathFromFileUrl(location.filename),
        line: location?.line,
      });
    }
  }

  return { entry, total, documented, missing };
}

function hasJsDoc(declaration: DocDeclaration): boolean {
  return typeof declaration.jsDoc?.doc === "string" &&
    declaration.jsDoc.doc.trim().length > 0;
}

function parseMinimumPercent(value: string): number {
  const percent = Number(value);

  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error(`Invalid docs coverage minimum: ${value}`);
  }

  return percent;
}

function percentage(documented: number, total: number): number {
  return total === 0 ? 100 : (documented / total) * 100;
}

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function pathFromFileUrl(value: string): string {
  if (!value.startsWith("file://")) {
    return value;
  }

  const path = decodeURIComponent(new URL(value).pathname);
  const cwd = `${Deno.cwd()}/`;
  return path.startsWith(cwd) ? path.slice(cwd.length) : path;
}
