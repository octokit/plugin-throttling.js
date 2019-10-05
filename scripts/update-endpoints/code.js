/**
 * We do not want to have `@octokit/routes` as a production dependency due to
 * its huge size. We are only interested in the REST API endpoint paths that
 * trigger notifications. So instead we automatically generate a file that
 * only contains these paths when @octokit/routes has a new release.
 */
const { writeFileSync } = require('fs')

const ENDPOINTS = require('./generated/endpoints.json')
const paths = []

for (const endpoint of ENDPOINTS) {
  if (endpoint.triggersNotification) {
    paths.push(endpoint.url.replace(/\{([^}]+)}/g, ':$1'))
  }
}

const uniquePaths = [...new Set(paths.sort())]
writeFileSync(
  './lib/triggers-notification-paths.json',
  JSON.stringify(uniquePaths, null, 2) + '\n'
)
