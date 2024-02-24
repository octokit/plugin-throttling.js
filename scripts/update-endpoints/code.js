/**
 * We do not want to have `@octokit/openapi` as a production dependency due to
 * its huge size. We are only interested in the REST API endpoint paths that
 * trigger notifications. So instead we automatically generate a file that
 * only contains these paths when @octokit/openapi has a new release.
 */
import { writeFileSync, readFileSync } from "node:fs";

import prettier from "prettier";

const ENDPOINTS = JSON.parse(
  readFileSync(new URL("./generated/endpoints.json", import.meta.url), "utf-8"),
);
const paths = [];

for (const endpoint of ENDPOINTS) {
  if (endpoint.triggersNotification) {
    paths.push(endpoint.url);
  }
}

const uniquePaths = [...new Set(paths.sort())];
async function main() {
  writeFileSync(
    "./src/generated/triggers-notification-paths.ts",
    await prettier.format(`export default ` + JSON.stringify(uniquePaths), {
      parser: "typescript",
    }),
  );
}
main();
