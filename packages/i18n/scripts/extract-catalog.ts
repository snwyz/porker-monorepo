import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repositoryDirectory = resolve(packageDirectory, "..", "..");
const catalogPath = resolve(packageDirectory, "src/catalog.json");

function trackedSourceFiles() {
  return execFileSync(
    "git",
    ["ls-files", "--", "apps/web/src", "apps/game-server/src"],
    { cwd: repositoryDirectory, encoding: "utf8" },
  )
    .split("\n")
    .filter((path) => /\.[cm]?[jt]sx?$/.test(path))
    .filter((path) => !/(^|\/)(test-harness)(\/|$)/.test(path))
    .filter((path) => !/\.(test|spec)\.[cm]?[jt]sx?$/.test(path));
}

function assertCatalogIsStable() {
  const rawCatalog = readFileSync(catalogPath, "utf8");
  const codes = [...rawCatalog.matchAll(/^\s*"(P\d+)"\s*:/gm)].map(
    (match) => match[1],
  );
  const duplicates = codes.filter(
    (code, index) => codes.indexOf(code) !== index,
  );
  if (duplicates.length > 0) {
    throw new Error(`Duplicate message code: ${duplicates[0]}`);
  }

  try {
    const previousCatalog = execFileSync(
      "git",
      ["show", "HEAD:packages/i18n/src/catalog.json"],
      {
        cwd: repositoryDirectory,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    );
    const previousCodes = [
      ...previousCatalog.matchAll(/^\s*"(P\d+)"\s*:/gm),
    ].map((match) => match[1]);
    const removedCode = previousCodes.find((code) => !codes.includes(code));
    if (removedCode !== undefined) {
      throw new Error(
        `Existing message code was removed or renumbered: ${removedCode}`,
      );
    }
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.startsWith("Existing message code")
    ) {
      throw error;
    }
  }
}

assertCatalogIsStable();

const locations = trackedSourceFiles().flatMap((path) => {
  const source = readFileSync(resolve(repositoryDirectory, path), "utf8");
  return [...source.matchAll(/\bP\d+\b/g)].map((match) => {
    const line = source.slice(0, match.index).split("\n").length;
    return `${path}:${line} ${match[0]}`;
  });
});

if (locations.length === 0) {
  console.log("No source message-code candidates found.");
} else {
  console.log(locations.join("\n"));
}
