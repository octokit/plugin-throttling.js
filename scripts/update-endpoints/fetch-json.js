const { writeFileSync } = require('fs')
const path = require('path')

const { graphql } = require('@octokit/graphql')

if (!process.env.VERSION) {
  throw new Error('VERSION environment variable must be set')
}

const QUERY = `
  query ($version: String) {{
    endpoints(version: $version) {
      url
      triggersNotification
    }
  }`

main()

async function main () {
  const { endpoints } = await graphql(QUERY, {
    url: 'https://octokit-routes-graphql-server.now.sh/',
    version: process.env.VERSION
  })

  writeFileSync(
    path.resolve(__dirname, 'generated', 'endpoints.json'),
    JSON.stringify(endpoints, null, 2) + '\n'
  )
}
