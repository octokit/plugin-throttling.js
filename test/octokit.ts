import { Octokit } from "@octokit/core";
import { RequestError } from "@octokit/request-error";
import { throttling } from "../src";

function testPlugin(octokit: Octokit) {
  const t0 = Date.now();
  octokit.__requestLog = [];
  octokit.__requestTimings = [];

  octokit.hook.wrap("request", async (request, options) => {
    octokit.__requestLog.push(`START ${options.method} ${options.url}`);
    octokit.__requestTimings.push(Date.now() - t0);
    await new Promise((resolve) => setTimeout(resolve, 0));

    const res = options.request.responses.shift();
    if (res.status >= 400) {
      const message =
        res.data.message != null
          ? res.data.message
          : `Test failed request (${res.status})`;
      const error = new RequestError(message, res.status, {
        headers: res.headers,
        request: options,
      });
      throw error;
    } else {
      octokit.__requestLog.push(`END ${options.method} ${options.url}`);
      octokit.__requestTimings.push(Date.now() - t0);
      return res;
    }
  });
}

export const TestOctokit = Octokit.plugin(testPlugin, throttling);
