const { writeFileSync } = require("fs");
const path = require("path");

const { graphql } = require("@octokit/graphql");

if (!process.env.VERSION) {
  throw new Error("VERSION environment variable must be set");
}

const version = process.env.VERSION.replace(/^v/, "");

const QUERY = `
  query($version: String) {
    endpoints(version: $version) {
      url
      triggersNotification
    }
  }
`;

main();

async function main() {
  const { endpoints } = await graphql(QUERY, {
    baseUrl: "https://github-openapi-graphql-server.vercel.app/api",
    version,
  });

  writeFileSync(
    path.resolve(__dirname, "generated", "endpoints.json"),
    JSON.stringify(endpoints, null, 2) + "\n"
  );
}
