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
    assets: config.assets || [],
    upgradeInterval: config.upgrade_interval
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

  var applier = UpgradeApplier({
    boshRunner: runner
  })

  boshbot.setup = function (opts, setupCb) {
    var controller = opts.controller
    var personality = opts.personality
    var notificationChannel = opts.notificationChannel

    var upgradeConvo = UpgradeConvo({
      checker: checker,
      applier: applier,
      notificationChannel: notificationChannel || null,
      interval: boshbot.upgradeInterval,
      personality: personality
    })
    upgradeConvo.addListeners(controller)

    var deployConvo = DeployConvo({
      deployments: boshbot.deployments,
      assetsFetcher: assets,
      assets: boshbot.assets,
      runner: runner,
      personality: personality
    })
    deployConvo.addListeners(controller)

    controller.hears(personality.text('hello_trigger'), ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
      var text = personality.reply({ user: message.user, key: 'hello_response' })
      bot.reply(message, text)
    })

    controller.hears(personality.text('ping_trigger'), ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
      var text = personality.reply({ user: message.user, key: 'ping_response' })
      bot.reply(message, text)
    })

    controller.hears(personality.text('env_trigger'), ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
      var text = personality.reply({ user: message.user, key: 'env_response', args: [boshbot.env] })
      bot.reply(message, text)
    })

    controller.hears('.*', ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
      var text = personality.reply({ user: message.user, key: 'unknown_response' })
      bot.reply(message, text)
    })

    assets.fetchAll(boshbot.assets, setupCb)
  }

  return boshbot
}

module.exports = BoshBot
