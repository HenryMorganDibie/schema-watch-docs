/** Qualify the installed customer and workflow CLIs against root navigation.
 * Source-level tests cannot catch a starter lockfile retaining an older checker.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

const fixture = mkdtempSync(join(tmpdir(), "thally-installed-navigation-"));
try {
  mkdirSync(join(fixture, "src/content"), { recursive: true });
  mkdirSync(join(fixture, "public"));
  writeFileSync(join(fixture, "docs.json"), JSON.stringify({
    tabs: [{ tab: "Documentation", pages: [
      "introduction",
      { group: "Getting started", pages: ["quickstart"] },
    ] }],
  }));
  for (const slug of ["introduction", "quickstart"]) {
    writeFileSync(join(fixture, "src/content", `${slug}.mdx`), [
      "---", `title: ${slug}`, "description: Learn how to get started.", "---", "",
      "Get started with the product and verify that your documentation works.",
    ].join("\n"));
  }
  for (const prefix of [".", ".github/thally-tooling"]) {
    const cli = resolve(prefix, "node_modules/@thallylabs/cli/dist/index.js");
    const result = spawnSync(process.execPath, [cli, "check", "--ci", fixture], {
      encoding: "utf8", timeout: 60_000,
    });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    assert.equal(result.error, undefined, `${prefix}: ${result.error}`);
    assert.equal(result.status, 0, `${prefix} installed CLI failed:\n${output}`);
    assert.doesNotMatch(output, /has no groups|orphan/i, `${prefix}: ${output}`);
    console.log(`${prefix}: installed CLI accepts root pages and groups`);
  }
} finally {
  rmSync(fixture, { recursive: true, force: true });
}
