/**
 * We do not want to have `@octokit/routes` as a production dependency due to
 * its huge size. We are only interested in the REST API endpoint paths that
 * trigger notifications. So instead we automatically generate a file that
 * only contains these paths when @octokit/routes has a new release.
 */
const { writeFileSync } = require('fs')

const routes = require('@octokit/routes')
const paths = []

Object.keys(routes).forEach(scope => {
  const scopeEndpoints = routes[scope]
  scopeEndpoints.forEach(endpoint => {
    if (endpoint.triggersNotification) {
      paths.push(endpoint.path)
    }
  })
})

const uniquePaths = [...new Set(paths.sort())]

const uniquePathsString = JSON.stringify(uniquePaths)
const fileContent = `export default ${uniquePathsString}`

writeFileSync('./src/triggers-notification-paths.js', fileContent)
