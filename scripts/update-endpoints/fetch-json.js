const { writeFileSync } = require("fs");
const path = require("path");

const graphql = require("github-openapi-graphql-query");

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
  const {
    data: { endpoints },
  } = await graphql(QUERY, {
    version,
  });

  writeFileSync(
    path.resolve(__dirname, "generated", "endpoints.json"),
    JSON.stringify(endpoints, null, 2) + "\n"
  );
}
