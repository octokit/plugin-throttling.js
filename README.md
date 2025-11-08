# plugin-throttling.js

> Octokit plugin for GitHub’s recommended request throttling

[![@latest](https://img.shields.io/npm/v/@octokit/plugin-throttling.svg)](https://www.npmjs.com/package/@octokit/plugin-throttling)
[![Build Status](https://github.com/octokit/plugin-throttling.js/workflows/Test/badge.svg)](https://github.com/octokit/plugin-throttling.js/actions?workflow=Test)

Implements all [recommended best practices](https://docs.github.com/en/rest/guides/best-practices-for-integrators) to prevent hitting secondary rate limits.

## Usage

<table>
<tbody valign=top align=left>
<tr><th>
Browsers
</th><td width=100%>

Load `@octokit/plugin-throttling` and [`@octokit/core`](https://github.com/octokit/core.js) (or core-compatible module) directly from [esm.sh](https://esm.sh)

```html
<script type="module">
  import { Octokit } from "https://esm.sh/@octokit/core";
  import { throttling } from "https://esm.sh/@octokit/plugin-throttling";
</script>
```

</td></tr>
<tr><th>
Node
</th><td>

Install with `npm install @octokit/core @octokit/plugin-throttling`. Optionally replace `@octokit/core` with a core-compatible module.

```js
import { Octokit } from "@octokit/core";
import { throttling } from "@octokit/plugin-throttling";
```

</td></tr>
</tbody>
</table>

> [!IMPORTANT]
> As we use [conditional exports](https://nodejs.org/api/packages.html#conditional-exports), you will need to adapt your `tsconfig.json` by setting `"moduleResolution": "node16", "module": "node16"`.
>
> See the TypeScript docs on [package.json "exports"](https://www.typescriptlang.org/docs/handbook/modules/reference.html#packagejson-exports).<br>
> See this [helpful guide on transitioning to ESM](https://gist.github.com/sindresorhus/a39789f98801d908bbc7ff3ecc99d99c) from [@sindresorhus](https://github.com/sindresorhus)

The code below creates a "Hello, world!" issue on every repository in a given organization. Without the throttling plugin it would send many requests in parallel and would hit rate limits very quickly. But the `@octokit/plugin-throttling` slows down your requests according to the official guidelines, so you don't get blocked before your quota is exhausted.

The `throttle.onSecondaryRateLimit` and `throttle.onRateLimit` options are required. Return `true` to automatically retry the request after `retryAfter` seconds.

```js
const MyOctokit = Octokit.plugin(throttling);

const octokit = new MyOctokit({
  auth: `secret123`,
  throttle: {
    onRateLimit: (retryAfter, options, octokit, retryCount) => {
      octokit.log.warn(
        `Request quota exhausted for request ${options.method} ${options.url}`,
      );

      if (retryCount < 1) {
        // only retries once
        octokit.log.info(`Retrying after ${retryAfter} seconds!`);
        return true;
      }
    },
    onSecondaryRateLimit: (retryAfter, options, octokit) => {
      // does not retry, only logs a warning
      octokit.log.warn(
        `SecondaryRateLimit detected for request ${options.method} ${options.url}`,
      );
    },
  },
});

async function createIssueOnAllRepos(org) {
  const repos = await octokit.paginate(
    octokit.repos.listForOrg.endpoint({ org }),
  );
  return Promise.all(
    repos.map(({ name }) =>
      octokit.issues.create({
        owner,
        repo: name,
        title: "Hello, world!",
      }),
    ),
  );
}
```

Pass `{ throttle: { enabled: false } }` to disable this plugin.

### Clustering

Clustering support allows your application to coordinate rate limiting **across Octokit instances and across Node.js processes** using Redis.

> **Note:** Redis clustering support is available but requires implementing a custom connection adapter. The `connection` parameter accepts any object that implements `disconnect(): Promise<void>` and `on(event: string, handler: Function): void` methods.

First install either `redis` or `ioredis`:

```
# NodeRedis (https://github.com/redis/node-redis)
npm install --save redis

# or ioredis (https://github.com/redis/ioredis)
npm install --save ioredis
```

Then create a connection adapter and pass it to the throttle options:

```js
import Redis from "redis";

const client = Redis.createClient({
  /* options */
});

// Create a connection adapter that implements the required interface
const connection = {
  async disconnect() {
    await client.disconnect();
  },
  on(event, handler) {
    client.on(event, handler);
  },
};

connection.on("error", (err) => console.error(err));

const octokit = new MyOctokit({
  auth: "secret123",
  throttle: {
    onSecondaryRateLimit: (retryAfter, options, octokit) => {
      /* ... */
    },
    onRateLimit: (retryAfter, options, octokit) => {
      /* ... */
    },

    // The connection object for Redis coordination
    connection,

    // A "throttling ID". All octokit instances with the same ID
    // using the same Redis server will share the throttling.
    id: "my-super-app",
  },
});

// To close the connection and allow your application to exit cleanly:
await connection.disconnect();
```

To use the `ioredis` library instead:

```js
import Redis from "ioredis";
const client = new Redis({
  /* options */
});

const connection = {
  async disconnect() {
    await client.disconnect();
  },
  on(event, handler) {
    client.on(event, handler);
  },
};

connection.on("error", (err) => console.error(err));
```

## Options

<table>
  <thead align=left>
    <tr>
      <th>
        name
      </th>
      <th>
        type
      </th>
      <th width=100%>
        description
      </th>
    </tr>
  </thead>
  <tbody align=left valign=top>
    <tr>
      <th>
        <code>options.retryAfterBaseValue</code>
      </th>
      <td>
        <code>Number</code>
      </td>
      <td>
        Number of milliseconds that will be used to multiply the time to wait based on `retry-after` or `x-ratelimit-reset` headers. Defaults to <code>1000</code>
      </td>
    </tr>
    <tr>
      <th>
        <code>options.fallbackSecondaryRateRetryAfter</code>
      </th>
      <td>
        <code>Number</code>
      </td>
      <td>
        Number of seconds to wait until retrying a request in case a secondary rate limit is hit and no <code>retry-after</code> header was present in the response. Defaults to <code>60</code>
      </td>
    </tr>
    <tr>
      <th>
        <code>options.connection</code>
      </th>
      <td>
        <code>Connection</code>
      </td>
      <td>
        A connection object for Redis clustering. Must implement <code>disconnect(): Promise&lt;void&gt;</code> and <code>on(event: string, handler: Function): void</code> methods. See <a href="#clustering">Clustering</a> above.
      </td>
    </tr>
    <tr>
      <th>
        <code>options.id</code>
      </th>
      <td>
        <code>string</code>
      </td>
      <td>
        A "throttling ID". All octokit instances with the same ID using the same Redis server will share the throttling. See <a href="#clustering">Clustering</a> above. Defaults to <code>no-id</code>.
      </td>
    </tr>
  </tbody>
</table>

## LICENSE

[MIT](LICENSE)
