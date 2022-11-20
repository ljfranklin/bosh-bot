var fs = require('fs')
var BoshBot = require('./src/bosh_bot')
var Config = require('./src/config')
var Slack = require('./src/slack/slack')
var SlackAuth = require('./src/slack/auth')
var Personality = require('./src/personality')

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

  var notificationChannelID = null
  if (!config.get('bosh').disable_background_upgrades) {
    notificationChannelID = config.get('slack').notification_channel_id
  }

  var personality = Personality(config.get('personality'))
  err = personality.loadSync()
  if (err) {
    console.error(err)
    process.exit(1)
  }

  var auth = SlackAuth({
    authorizedUsers: config.get('slack').authorized_usernames,
    authorizedChannels: config.get('slack').authorized_channels,
    personality: personality
  })

  err = auth.addHandler(controller, response)
  if (err) {
    console.error(err)
    process.exit(1)
  }

  var bot = new BoshBot(config.get('bosh'))
  var setupOpts = {
    controller: controller,
    personality: personality,
    notificationChannel: notificationChannelID
  }
  bot.setup(setupOpts, function (err) {
    if (err) {
      console.error(err)
      process.exit(1)
    }

    var pidfile = config.get('pidfile')
    if (pidfile) {
      fs.writeFileSync(pidfile, process.pid.toString())
    }

    console.log('Ready for connections!')
  })
})
