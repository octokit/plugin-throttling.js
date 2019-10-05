const { writeFileSync } = require('fs')
const path = require('path')

const { graphql } = require('@octokit/graphql')

const QUERY = `
  {
    endpoints {
      url
      triggersNotification
    }
  }`

main()

async function main () {
  const { endpoints } = await graphql(QUERY, {
    url: 'https://octokit-routes-graphql-server.now.sh/'
  })

  writeFileSync(
    path.resolve(__dirname, 'generated', 'endpoints.json'),
    JSON.stringify(endpoints, null, 2) + '\n'
  )
}
