import { Octokit } from "@octokit/core";
import { throttling } from "../src/index";
// ************************************************************
// THIS CODE IS NOT EXECUTED. IT IS FOR TYPECHECKING ONLY
// ************************************************************

const octokit = new Octokit();

// onSecondaryLimit()
throttling(octokit, {
  throttle: {
    enabled: true,
    onRateLimit: () => {},
    onSecondaryRateLimit: () => {},
  },
});

// onRateLimit() missing should be a TS Error
throttling(octokit, {
  // @ts-expect-error
  throttle: {
    onSecondaryRateLimit: () => {},
  },
});

// onSecondaryLimit() and onAbuseLimit() missing should be a TS Error
throttling(octokit, {
  // @ts-expect-error
  throttle: {
    onRateLimit: () => {},
  },
});
