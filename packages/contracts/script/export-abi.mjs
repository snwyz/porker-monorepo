import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const contracts = ["MockPokerToken", "PokerEscrow"];

await mkdir(resolve(root, "abi"), { recursive: true });

for (const contract of contracts) {
  const artifactPath = resolve(root, "out", `${contract}.sol`, `${contract}.json`);
  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  const output = `${JSON.stringify(artifact.abi, null, 2)}\n`;
  await writeFile(resolve(root, "abi", `${contract}.json`), output, "utf8");
}
