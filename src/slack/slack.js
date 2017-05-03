var Botkit = require('botkit')

function Slack (config = {}) {
  var slack = {
    token: config.token
  }

  slack.start = function (cb) {
    var controller = Botkit.slackbot({
      debug: false,
      retry: 10
    })
    var slackbot = controller.spawn({
      token: slack.token,
      retry: Infinity
    })
    slackbot.startRTM(function (err, bot, response) {
      if (err) {
        cb(err, null, null)
        return
      }

      // controller does not provide a built-in way to originate messages
      controller.say = function (opts, cb) {
        bot.say(opts, cb)
      }

      cb(null, controller, response)
    })
  }

  return slack
}

module.exports = Slack
