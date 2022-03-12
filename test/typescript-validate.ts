import { Octokit } from "@octokit/core";
import { throttling } from "../src/index";
// ************************************************************
// THIS CODE IS NOT EXECUTED. IT IS FOR TYPECHECKING ONLY
// ************************************************************

const octokit = new Octokit();

// will be deprecated soon
// onAbuseLimit()
throttling(octokit, {
  throttle: { enabled: true, onRateLimit: () => {}, onAbuseLimit: () => {} },
});

// onSecondaryLimit()
throttling(octokit, {
  throttle: {
    enabled: true,
    onRateLimit: () => {},
    onSecondaryRateLimit: () => {},
  },
});

// onSecondaryLimit() and onAbuseLimit() should be a TS Error
throttling(octokit, {
  // @ts-expect-error
  throttle: {
    enabled: true,
    onRateLimit: () => {},
    onSecondaryRateLimit: () => {},
    onAbuseLimit: () => {},
  },
});

// onRateLimit() missing should be a TS Error
throttling(octokit, {
  // @ts-expect-error
  throttle: {
    enabled: true,
    onSecondaryRateLimit: () => {},
  },
});

// onSecondaryLimit() and onAbuseLimit() missing should be a TS Error
throttling(octokit, {
  // @ts-expect-error
  throttle: {
    enabled: true,
    onRateLimit: () => {},
  },
});
