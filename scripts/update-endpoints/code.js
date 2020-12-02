/**
 * We do not want to have `@octokit/openapi` as a production dependency due to
 * its huge size. We are only interested in the REST API endpoint paths that
 * trigger notifications. So instead we automatically generate a file that
 * only contains these paths when @octokit/openapi has a new release.
 */
const { writeFileSync } = require("fs");

const prettier = require("prettier");

const ENDPOINTS = require("./generated/endpoints.json");
const paths = [];

for (const endpoint of ENDPOINTS) {
  if (endpoint.triggersNotification) {
    paths.push(endpoint.url);
  }
}

const uniquePaths = [...new Set(paths.sort())];
writeFileSync(
  "./src/generated/triggers-notification-paths.ts",
  prettier.format(`export default ` + JSON.stringify(uniquePaths), {
    parser: "typescript",
  })
);
