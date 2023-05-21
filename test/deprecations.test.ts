import { Octokit } from "@octokit/core";
import { throttling } from "../src";

const TestOctokit = Octokit.plugin(throttling);

describe("deprecations", () => {
  it("throttle.minimalSecondaryRateRetryAfter option", () => {
    const log = {
      warn: jest.fn(),
    };
    new TestOctokit({
      // @ts-expect-error
      log,
      throttle: {
        minimalSecondaryRateRetryAfter: 1,
        onSecondaryRateLimit: () => 1,
        onRateLimit: () => 1,
      },
    });

    expect(log.warn).toHaveBeenCalledWith(
      "[@octokit/plugin-throttling] `options.throttle.minimalSecondaryRateRetryAfter` is deprecated, please use `options.throttle.fallbackSecondaryRateRetryAfter` instead"
    );
  });
});
