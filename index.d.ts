/**
 * Repository:
 * https://github.com/octokit/plugin-throttling.js
 *
 * Resources:
 * https://octokit.github.io/rest.js/#throttling
 * https://developer.github.com/v3/guides/best-practices-for-integrators/#dealing-with-rate-limits
 */

declare module '@octokit/plugin-throttling' {
    import Octokit from '@octokit/rest';
    import Bottleneck from 'bottleneck';

    /**
     * More context provided to your limit callback function.
     */
    interface LimitCallbackParams {
        request: {
            /*
             * If this request has been retried,
             * which retry attempt is being limited.
             * Use this to determine how many retries
             * you want to attempt before giving up
             * due to being rate limited.
             */
            retryCount: number;
        };
    }

    /**
     * When you have been limited, you need to slow down your requests.
     *
     * Use the "Retry-After" response header to know how many seconds
     * to wait before your next request.
     *
     * The value of the "Retry-After" header will always be an integer,
     * representing the number of seconds you should wait before making
     * requests again.
     *
     * For example, "Retry-After: 30" means you should wait
     * 30 seconds before sending more requests.
     *
     * @param {number} retryAfter - number of seconds to wait
     * @param {LimitCallbackParams} params - context about retry attempts
     *
     * @returns `true` to retry the request after waiting, `false` to not retry
     */
    type RateLimitCallback = (
        retryAfter: number,
        params: LimitCallbackParams
    ) => boolean;

    interface ThrottleOptions extends Octokit.Options {
        throttle: {
            /*
             * Enables the throttler.
             * Default is `true`.
             */
            enabled?: boolean;
            /*
             * Called when your app exceeds the normal rate limit
             * for an API endpoint. Slow down.
             */
            onRateLimit: RateLimitCallback;
            /*
             * GitHub has detected potential abuse of an API endpoint.
             * Slow down or risk having access denied from your app.
             */
            onAbuseLimit: RateLimitCallback;
            /*
             * Only if enabling cluster support.
             * Specify one of `connection` or `Bottleneck`.
             *
             * The Bottleneck connection object for clustering support.
             * Ensures that your application will not go over rate limits
             * across Octokit instances and across Nodejs processes.
             */
            connection?:
                | Bottleneck.RedisConnection
                | Bottleneck.IORedisConnection;
            /*
             * Only if enabling cluster support.
             *
             * Per the Bottleneck documentation,
             * "Limiters that have been idle for longer than 5 minutes are
             * deleted to avoid memory leaks, this value can be changed by
             * passing a different timeout option, in milliseconds."
             *
             * Default is 1000 * 60 * 2 milliseconds (two minutes).
             */
            timeout?: number;
            /*
             * Only if enabling cluster support.
             * Specify one of `connection` or `Bottleneck`.
             *
             * Alternative Bottleneck implementation if not using Redis.
             */
            Bottleneck?: Bottleneck;
            /*
             * Only if enabling Cluster Support.
             *
             * A "throttling ID". All Octokit instances with the same ID
             * using the same Redis server will share the throttling.
             *
             * Default is 'no-id'.
             */
            id?: string;
        };
    }

    /**
     * This module is an Octokit plugin.
     * Required for the Octokit.plugin(..) method to accept this type.
     */
    export default function plugin(
        octokit: Octokit,
        options: Octokit.Options
    ): void;
}
