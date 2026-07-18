import { stderr, stdout } from "node:process";

import {
  writeCandidate as writeCandidateFile,
  type CandidateTarget,
  type CandidateWriteResult,
} from "./candidate-writer.js";
import { SnapshotRepository } from "./snapshot.repository.js";

type ParsedCommand = {
  readonly snapshotDirectory: string;
  readonly target: CandidateTarget;
};

type WriteCandidate = (
  source: SnapshotRepository,
  target: CandidateTarget,
) => Promise<CandidateWriteResult>;

export type CandidateCliDependencies = {
  readonly createSnapshotRepository?: (directory: string) => SnapshotRepository;
  readonly writeCandidate?: WriteCandidate;
  readonly stdout?: (line: string) => void;
};

export type CandidateCli = {
  run(argv: readonly string[]): Promise<void>;
};

export function createCandidateCli(
  dependencies: CandidateCliDependencies = {},
): CandidateCli {
  const createSnapshotRepository =
    dependencies.createSnapshotRepository ??
    ((directory: string) => new SnapshotRepository(directory));
  const writeCandidate = dependencies.writeCandidate ?? writeCandidateFile;
  const output = dependencies.stdout ?? ((line: string) => stdout.write(line));

  return {
    async run(argv: readonly string[]): Promise<void> {
      const command = parseCommand(argv);
      const result = await writeCandidate(
        createSnapshotRepository(command.snapshotDirectory),
        command.target,
      );
      output(
        `candidate version=${result.summary.version} catalog=${result.summary.catalogEntries} zh-CN=${result.summary.zhEntries} git_gate=manual-required\n`,
      );
      output(
        "No Git command was executed. Review the explicit candidate targets, then run the repository Git gate manually.\n",
      );
    },
  };
}

function parseCommand(argv: readonly string[]): ParsedCommand {
  if (argv[0] !== "write") {
    throw new Error(
      "Usage: candidate-cli write --snapshot-dir <path> --catalog-output <path> --zh-output <path>",
    );
  }

  const flags = parseFlags(argv.slice(1));
  const snapshotDirectory = requiredFlag(flags, "--snapshot-dir");
  return {
    snapshotDirectory,
    target: {
      catalogFile: requiredFlag(flags, "--catalog-output"),
      zhFile: requiredFlag(flags, "--zh-output"),
    },
  };
}

function parseFlags(argv: readonly string[]): ReadonlyMap<string, string> {
  const flags = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (
      flag !== "--snapshot-dir" &&
      flag !== "--catalog-output" &&
      flag !== "--zh-output"
    ) {
      throw new Error(`Unknown argument ${flag ?? ""}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}`);
    }
    flags.set(flag, value);
    index += 1;
  }
  return flags;
}

function requiredFlag(
  flags: ReadonlyMap<string, string>,
  flag: string,
): string {
  const value = flags.get(flag);
  if (value === undefined) {
    throw new Error(`An explicit ${flag} path is required`);
  }
  return value;
}

if (process.argv[1]?.endsWith("/candidate-cli.js")) {
  void createCandidateCli()
    .run(process.argv.slice(2))
    .catch((error: unknown) => {
      stderr.write(
        `${error instanceof Error ? error.message : String(error)}\n`,
      );
      process.exitCode = 1;
    });
}
