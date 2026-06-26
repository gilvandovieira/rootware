const DEFAULT_RESULT_DIR = "benchmark/results";
const DEFAULT_CASES = ["benchmark/cases"];
const DEFAULT_SEED = "1";
const ENVELOPE_SCHEMA_VERSION = 2;

const textDecoder = new TextDecoder();

interface RunOptions {
  readonly cases: readonly string[];
  readonly resultDir: string;
  readonly outputPath?: string;
  readonly seed: string;
  readonly filter?: string;
  readonly tags: readonly string[];
  readonly note?: string;
  readonly benchArgs: readonly string[];
}

interface CommandResult {
  readonly success: boolean;
  readonly code: number;
  readonly stdout: string;
  readonly stderr: string;
}

interface GitMetadata {
  readonly available: boolean;
  readonly branch?: string;
  readonly commit?: string;
  readonly dirty?: boolean;
  readonly statusShort?: readonly string[];
}

interface BenchmarkSummary {
  readonly benchmarkCount: number;
  readonly groups: readonly string[];
  readonly names: readonly string[];
}

interface BenchmarkRecord {
  readonly name: string;
  readonly group?: string;
}

interface RuntimeMetadata {
  readonly deno: string;
  readonly v8: string;
  readonly typescript: string;
  readonly os: string;
  readonly arch: string;
  readonly userAgent: string;
  readonly hardwareConcurrency?: number;
}

/** Hardware info recorded with each run. Deliberately excludes PII (no
 * hostname, username, home path, or network details). */
interface MachineMetadata {
  readonly os: string;
  readonly arch: string;
  readonly cpuModel?: string;
  readonly cpuCores?: number;
  readonly totalMemoryBytes?: number;
}

interface WorkspaceMetadata {
  readonly root: string;
  readonly denoJsonSha256?: string;
  readonly denoLockSha256?: string;
}

interface BenchmarkRunEnvelope {
  readonly schemaVersion: typeof ENVELOPE_SCHEMA_VERSION;
  readonly createdAt: string;
  readonly durationMs: number;
  readonly command: readonly string[];
  readonly config: {
    readonly cases: readonly string[];
    readonly seed: string;
    readonly filter?: string;
    readonly tags: readonly string[];
    readonly note?: string;
    readonly benchArgs: readonly string[];
  };
  readonly runtime: RuntimeMetadata;
  readonly machine: MachineMetadata;
  readonly workspace: WorkspaceMetadata;
  readonly git: GitMetadata;
  readonly summary: BenchmarkSummary;
  readonly denoBench: unknown;
}

if (import.meta.main) {
  await main(Deno.args);
}

async function main(args: readonly string[]): Promise<void> {
  const options = parseArgs(args);
  const createdAt = new Date();
  const command = buildBenchCommand(options);
  const startedAt = performance.now();
  const result = await runCommand(command);
  const durationMs = Math.round((performance.now() - startedAt) * 100) / 100;

  if (!result.success) {
    await Deno.stdout.write(new TextEncoder().encode(result.stdout));
    await Deno.stderr.write(new TextEncoder().encode(result.stderr));
    Deno.exit(result.code);
  }

  const denoBench = parseDenoBenchJson(result.stdout);
  const outputPath = options.outputPath ??
    `${options.resultDir}/${formatTimestamp(createdAt)}.json`;
  const workingDir = Deno.cwd();
  const envelope: BenchmarkRunEnvelope = {
    schemaVersion: ENVELOPE_SCHEMA_VERSION,
    createdAt: createdAt.toISOString(),
    durationMs,
    // Store the binary name only — the absolute path leaks the home directory.
    command: [basename(command[0]), ...command.slice(1)],
    config: {
      cases: options.cases,
      seed: options.seed,
      ...(options.filter === undefined ? {} : { filter: options.filter }),
      tags: options.tags,
      ...(options.note === undefined ? {} : { note: options.note }),
      benchArgs: options.benchArgs,
    },
    runtime: runtimeMetadata(),
    machine: machineMetadata(denoBench),
    workspace: await workspaceMetadata(),
    git: await gitMetadata(),
    summary: summarizeDenoBench(denoBench),
    denoBench,
  };

  // Strip the absolute working-directory prefix (e.g. from `denoBench` origins)
  // so no home path / username is recorded.
  await writeJson(outputPath, envelope, [[workingDir, basename(workingDir)]]);
  console.log(`Wrote benchmark result to ${outputPath}`);
}

function parseArgs(args: readonly string[]): RunOptions {
  let resultDir = DEFAULT_RESULT_DIR;
  let outputPath: string | undefined;
  let seed = DEFAULT_SEED;
  let filter: string | undefined;
  let note: string | undefined;
  const tags: string[] = [];
  const cases: string[] = [];
  const benchArgs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    switch (arg) {
      case "--help":
      case "-h":
        printUsage();
        Deno.exit(0);
        break;
      case "--out":
        outputPath = takeValue(args, index, arg);
        index += 1;
        break;
      case "--result-dir":
        resultDir = takeValue(args, index, arg);
        index += 1;
        break;
      case "--seed":
        seed = takeValue(args, index, arg);
        index += 1;
        break;
      case "--filter":
        filter = takeValue(args, index, arg);
        index += 1;
        break;
      case "--tag":
        tags.push(takeValue(args, index, arg));
        index += 1;
        break;
      case "--note":
        note = takeValue(args, index, arg);
        index += 1;
        break;
      case "--case":
        cases.push(takeValue(args, index, arg));
        index += 1;
        break;
      case "--":
        benchArgs.push(...args.slice(index + 1));
        index = args.length;
        break;
      default:
        benchArgs.push(arg);
        break;
    }
  }

  return {
    cases: cases.length === 0 ? DEFAULT_CASES : cases,
    resultDir,
    ...(outputPath === undefined ? {} : { outputPath }),
    seed,
    ...(filter === undefined ? {} : { filter }),
    tags,
    ...(note === undefined ? {} : { note }),
    benchArgs,
  };
}

function buildBenchCommand(options: RunOptions): string[] {
  return [
    Deno.execPath(),
    "bench",
    "--json",
    "--seed",
    options.seed,
    ...(options.filter === undefined ? [] : ["--filter", options.filter]),
    ...options.benchArgs,
    ...options.cases,
  ];
}

async function runCommand(command: readonly string[]): Promise<CommandResult> {
  const output = await new Deno.Command(command[0], {
    args: command.slice(1),
    stdout: "piped",
    stderr: "piped",
    clearEnv: true,
    env: commandEnvironment(),
  }).output();

  return {
    success: output.success,
    code: output.code,
    stdout: textDecoder.decode(output.stdout),
    stderr: textDecoder.decode(output.stderr),
  };
}

function commandEnvironment(): Record<string, string> {
  return {
    DENO_NO_UPDATE_CHECK: "1",
    NO_COLOR: "1",
    ...optionalEnv("PATH"),
  };
}

function optionalEnv(name: string): Record<string, string> {
  try {
    const value = Deno.env.get(name);
    return value === undefined ? {} : { [name]: value };
  } catch {
    return {};
  }
}

function parseDenoBenchJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch (cause) {
    throw new Error("Unable to parse deno bench JSON output", {
      cause,
    });
  }
}

function runtimeMetadata(): RuntimeMetadata {
  return {
    deno: Deno.version.deno,
    v8: Deno.version.v8,
    typescript: Deno.version.typescript,
    os: Deno.build.os,
    arch: Deno.build.arch,
    userAgent: navigator.userAgent,
    hardwareConcurrency: navigator.hardwareConcurrency,
  };
}

async function workspaceMetadata(): Promise<WorkspaceMetadata> {
  return {
    // Basename only — the absolute path would leak the home directory/username.
    root: basename(Deno.cwd()),
    denoJsonSha256: await hashFile("deno.json"),
    denoLockSha256: await hashFile("deno.lock"),
  };
}

function machineMetadata(denoBench: unknown): MachineMetadata {
  const cpuModel = isRecord(denoBench) && typeof denoBench.cpu === "string"
    ? denoBench.cpu
    : undefined;

  let totalMemoryBytes: number | undefined;
  try {
    totalMemoryBytes = Deno.systemMemoryInfo().total;
  } catch {
    // No --allow-sys: omit memory rather than fail.
  }

  return {
    os: Deno.build.os,
    arch: Deno.build.arch,
    ...(cpuModel === undefined ? {} : { cpuModel }),
    cpuCores: navigator.hardwareConcurrency,
    ...(totalMemoryBytes === undefined ? {} : { totalMemoryBytes }),
  };
}

async function gitMetadata(): Promise<GitMetadata> {
  const branch = await runText(["git", "rev-parse", "--abbrev-ref", "HEAD"]);
  const commit = await runText(["git", "rev-parse", "HEAD"]);
  const statusText = await runText(["git", "status", "--short"]);

  if (
    branch === undefined && commit === undefined && statusText === undefined
  ) {
    return { available: false };
  }

  const statusShort = statusText === undefined || statusText.length === 0
    ? []
    : statusText.split("\n").filter((line) => line.length > 0);

  return {
    available: true,
    ...(branch === undefined ? {} : { branch }),
    ...(commit === undefined ? {} : { commit }),
    dirty: statusShort.length > 0,
    statusShort,
  };
}

async function runText(
  command: readonly string[],
): Promise<string | undefined> {
  try {
    const result = await runCommand(command);

    if (!result.success) {
      return undefined;
    }

    return result.stdout.trim();
  } catch {
    return undefined;
  }
}

async function hashFile(path: string): Promise<string | undefined> {
  try {
    const bytes = await Deno.readFile(path);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return undefined;
  }
}

function summarizeDenoBench(value: unknown): BenchmarkSummary {
  const records = collectBenchmarkRecords(value);

  return {
    benchmarkCount: records.length,
    groups: unique(records.map((record) => record.group).filter(isString)),
    names: unique(records.map((record) => record.name)),
  };
}

function collectBenchmarkRecords(
  value: unknown,
  depth = 0,
): BenchmarkRecord[] {
  if (depth > 6) {
    return [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => collectBenchmarkRecords(entry, depth + 1));
  }

  if (!isRecord(value)) {
    return [];
  }

  const records: BenchmarkRecord[] = [];
  const name = value.name;

  if (typeof name === "string") {
    records.push({
      name,
      ...(typeof value.group === "string" ? { group: value.group } : {}),
    });
  }

  for (const nested of Object.values(value)) {
    if (nested !== name) {
      records.push(...collectBenchmarkRecords(nested, depth + 1));
    }
  }

  return records;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)].sort();
}

async function writeJson(
  outputPath: string,
  value: BenchmarkRunEnvelope,
  redactions: readonly (readonly [string, string])[] = [],
): Promise<void> {
  const directory = dirname(outputPath);

  if (directory.length > 0) {
    await Deno.mkdir(directory, { recursive: true });
  }

  let json = JSON.stringify(value, null, 2);
  for (const [from, to] of redactions) {
    if (from.length > 0) {
      json = json.replaceAll(from, to);
    }
  }

  await Deno.writeTextFile(outputPath, `${json}\n`);
}

function basename(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index === -1 ? path : path.slice(index + 1);
}

function dirname(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index === -1 ? "" : path.slice(0, index);
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replaceAll(":", "").replaceAll(".", "");
}

function takeValue(
  args: readonly string[],
  index: number,
  flag: string,
): string {
  const value = args[index + 1];

  if (value === undefined || value.length === 0) {
    throw new Error(`${flag} requires a value`);
  }

  return value;
}

function printUsage(): void {
  console.log(`Run Rootware benchmarks and store a reproducible result envelope.

Usage:
  deno task benchmark
  deno task benchmark --filter schema
  deno task benchmark --case benchmark/cases/foundation.bench.ts --tag local

Options:
  --case <path>        Benchmark file or directory. Repeatable.
  --filter <pattern>   Passed to deno bench --filter.
  --seed <number>      Passed to deno bench --seed. Defaults to ${DEFAULT_SEED}.
  --tag <tag>          Result tag. Repeatable.
  --note <text>        Human note stored in the result envelope.
  --out <path>         Exact result JSON path.
  --result-dir <path>  Directory for generated result JSON.
  --                  Remaining args are forwarded to deno bench.
`);
}
