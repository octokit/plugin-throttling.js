# plugin-throttling.js

> Octokit plugin for GitHub’s recommended request throttling

[![npm](https://img.shields.io/npm/v/@octokit/plugin-throttling.svg)](https://www.npmjs.com/package/@octokit/plugin-throttling)
[![Build Status](https://travis-ci.com/octokit/plugin-throttling.js.svg)](https://travis-com.org/octokit/plugin-throttling.js)
[![Coverage Status](https://img.shields.io/coveralls/github/octokit/plugin-throttling.js.svg)](https://coveralls.io/github/octokit/plugin-throttling.js)
[![Greenkeeper](https://badges.greenkeeper.io/octokit/plugin-throttling.js.svg)](https://greenkeeper.io/)

Implements all [recommended best practises](https://developer.github.com/v3/guides/best-practices-for-integrators/) to prevent hitting abuse rate limits.

## Usage

The code below creates a "Hello, world!" issue on every repository in a given organization. Without the throttling plugin it would send many requests in parallel and would hit rate limits very quickly. But the `@octokit/plugin-throttling` makes sure that no requests using the same authentication token are throttled correctly.

```js
const Octokit = require('@ocotkit/rest')
  .plugin(require('@octokit/plugin-throttling'))

const octokit = new Octokit()
octokit.authenticate({
  type: 'token',
  token: process.env.TOKEN
})

async function createIssueOnAllRepos (org) {
  const repos = await octokit.paginate(octokit.repos.listForOrg.endpoint({ org }))
  return Promise.all(repos.forEach(({ name } => {
    octokit.issues.create({
      owner,
      repo: name,
      title: 'Hello, world!'
    })
  })))
}
```

Handle events

Return `true` if you wish to retry the request, it will be retried after `retryAfter` seconds.

```js
octokit.throttle.on('rate-limit', (retryAfter, retryCount, options) => {
  console.warn(`Rate-limit hit for request ${options.method} ${options.url}`)

  // In this example we only retry twice
  if (retryCount < 2) {
    return true
  }
})
octokit.throttle.on('abuse-limit', (retryAfter, retryCount, options) => {
  console.warn(`Abuse-limit hit for request ${options.method} ${options.url}`)

  // In this example we only retry GET requests
  if (options.method === 'GET') {
    return true
  }
})
```

## LICENSE

[MIT](LICENSE)
