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

  var notificationChannelID = null
  if (!config.get('bosh').disable_background_upgrades) {
    var notificationChannelName = config.get('slack').notification_channel
    var notificationChannel = response.channels.find(function (channel) {
      return (channel.name === notificationChannelName)
    })
    if (!notificationChannel) {
      console.error(`Failed to find channel with name '${notificationChannelName}'`)
      process.exit(1)
    }
    notificationChannelID = notificationChannel.id
  }

  var bot = new BoshBot(config.get('bosh'))
  bot.setup(controller, notificationChannelID, function (err) {
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
