import { writeFileSync } from "node:fs";

import graphql from "github-openapi-graphql-query";

if (!process.env.VERSION) {
  throw new Error("VERSION environment variable must be set");
}

const version = process.env.VERSION.replace(/^v/, "");

const QUERY = `
  query($version: String) {
    endpoints(version: $version, ghecCompatibilityMode: true) {
      url
      triggersNotification
    }
  }
`;

main();

async function main() {
  const res = await graphql(QUERY, { version });
  const endpoints = res.data.endpoints;

  writeFileSync(
    new URL("./generated/endpoints.json", import.meta.url),
    JSON.stringify(endpoints, null, 2) + "\n",
  );
}
