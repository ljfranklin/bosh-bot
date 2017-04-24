var fs = require('fs')
var BoshBot = require('./src/bosh_bot')
var Config = require('./src/config')
var Slack = require('./src/slack/slack')
var SlackAuth = require('./src/slack/auth')

console.log('Spinning up...')

var configPath = process.env.BOSH_BOT_CONFIG
if (!configPath) {
  // TODO: show example format or steps
  console.error('Error: Set BOSH_BOT_CONFIG in your environment.')
  process.exit(1)
}

var config = Config(configPath)
var loadErr = config.loadSync()
if (loadErr) {
  console.error(`Invalid Config: ${loadErr}`)
  process.exit(1)
}

console.log('Starting bot...')
var slack = Slack({
  token: config.get('slack.token')
})
slack.start(function (err, controller, response) {
  if (err) {
    console.error(err)
    process.exit(1)
  }

  var auth = SlackAuth({
    authorizedUsers: config.get('slack').authorized_usernames,
    authorizedChannels: config.get('slack').authorized_channels
  })

  err = auth.addHandler(controller, response)
  if (err) {
    console.error(err)
    process.exit(1)
  }

  var notificationChannel = config.get('slack').notification_channel || 'general'
  var bot = new BoshBot(config.get('bosh'))
  bot.setup(controller, notificationChannel, function (err) {
    if (err) {
      console.error(err)
      process.exit(1)
    }

    var pidfile = config.get('pidfile')
    if (pidfile) {
      fs.writeFileSync(pidfile, process.pid)
    }

    console.log('Ready for connections!')
  })
})
