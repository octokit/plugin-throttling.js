module.exports = wrapRequest

const noop = () => Promise.resolve()

function wrapRequest (state, request, options) {
  return state.retryLimiter.schedule(doRequest, state, request, options)
}

async function doRequest (state, request, options) {
  const isWrite = options.method !== 'GET' && options.method !== 'HEAD'
  const retryCount = ~~options.request.retryCount
  const jobOptions = retryCount > 0 ? { priority: 0, weight: 0 } : {}

  // Guarantee at least 1000ms between writes
  if (isWrite) {
    await state.writeLimiter.schedule(jobOptions, noop)
  }

  // Guarantee at least 3000ms between requests that trigger notifications
  if (isWrite && state.triggersNotification.includes(options.url)) {
    await state.triggersNotificationLimiter.schedule(jobOptions, noop)
  }

  return state.globalLimiter.schedule(jobOptions, request, options)
}
