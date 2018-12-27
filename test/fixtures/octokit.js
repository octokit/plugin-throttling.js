const HttpError = require('@octokit/request/lib/http-error')

module.exports = class FakeOctokit {
  constructor () {
    this.wrapHooks = []
    this.hook = {
      wrap: this._wrap.bind(this)
    }
  }

  _wrap (flow, cb) {
    this.wrapHooks.push({ flow, cb })
  }

  plugin (plugin) {
    plugin(this)
    return this
  }

  _applyWrapHooks (stack, flow, request, options) {
    if (stack.length === 0) {
      return request(options)
    } else {
      const hook = stack[0]
      if (hook.flow === flow) {
        const task = (options) => {
          return this._applyWrapHooks(stack.slice(1), flow, request, options)
        }
        return hook.cb(task, options)
      }
    }
  }

  async request (options, replies) {
    // Create array from a single response or multiple responses
    const responses = [].concat(replies)

    const request = function (options) {
      const res = responses.shift()
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          if (res.status >= 400) {
            const message = res.data.message != null ? res.data.message : `Test failed request (${res.status})`
            const error = new HttpError(message, res.status, res.headers, options)
            return reject(error)
          }
          return resolve(res)
        }, 0)
      })
    }

    return this._applyWrapHooks(this.wrapHooks, 'request', request, options)
  }
}
