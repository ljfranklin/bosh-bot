var BoshRunner = require('./bosh_runner')
var BoshioClient = require('./boshio_client')
var Assets = require('./assets')
var UpgradeChecker = require('./upgrade/checker')
var UpgradeApplier = require('./upgrade/applier')
var UpgradeConvo = require('./upgrade/convo')
var DeployConvo = require('./deploy/convo')

function BoshBot (config) {
  var boshbot = {
    env: config.env,
    user: config.user,
    password: config.password,
    deployments: config.deployments || [],
    releases: config.releases || [],
    stemcells: config.stemcells || [],
    assets: config.assets || []
  }

  // TODO: random tmp dir?
  var assetsDir = '/tmp'

  var boshioClient = BoshioClient()
  var assets = Assets({
    dir: assetsDir
  })

  config.cwd = assetsDir
  var runner = BoshRunner(config)
  runner.precheck()

  var checker = UpgradeChecker({
    boshRunner: runner,
    boshioClient: boshioClient,
    stemcells: config.stemcells,
    releases: config.releases
  })

  var upgrader = UpgradeApplier({
    boshRunner: runner
  })

  boshbot.setup = function (controller, defaultChannel, setupCb) {
    var upgradeConvo = UpgradeConvo({
      checker: checker,
      upgrader: upgrader,
      defaultChannel: defaultChannel
    })
    upgradeConvo.addListeners(controller)

    var deployConvo = DeployConvo({
      deployments: boshbot.deployments,
      assetsFetcher: assets,
      assets: boshbot.assets,
      runner: runner
    })
    deployConvo.addListeners(controller)

    controller.hears('hello', ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
      bot.reply(message, `<@${message.user}> Hello yourself.`)
    })

    controller.hears('ping', ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
      bot.reply(message, `<@${message.user}> pong`)
    })

    controller.hears('env', ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
      bot.reply(message, `<@${message.user}> Currently targeting *${boshbot.env}*.`)
    })

    controller.hears('.*', ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
      bot.reply(message, `<@${message.user}> Sorry, didn't catch that...`)
    })

    assets.fetchAll(boshbot.assets, setupCb)
  }

  return boshbot
}

module.exports = BoshBot
