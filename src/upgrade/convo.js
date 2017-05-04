var async = require('async')

function UpgradeConvo (config) {
  var convo = {
    interval: config.interval,
    checker: config.checker,
    applier: config.applier,
    defaultChannel: config.defaultChannel,
    disableBackgroundUpgrades: (config.defaultChannel == null)
  }

  convo.addListeners = function (controller) {
    controller.hears('upgrade', ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
      bot.reply(message, `<@${message.user}> Let's see if any flight upgrades are available...`)
      async.parallel([
        convo.checker.upgradeableReleases,
        convo.checker.upgradeableStemcells
      ],
      function (err, results) {
        if (err) {
          bot.reply(message, `<@${message.user}> Sorry, we hit a glitch trying to check for upgrades: ${err}.`)
          return
        }

        var releasesToUpload = results[0]
        var stemcellsToUpload = results[1]

        var uploadedItems = releasesToUpload.concat(stemcellsToUpload).map(function (r) { return r.displayName })
        if (uploadedItems.length === 0) {
          bot.reply(message, `<@${message.user}> I'm sorry, there don't appear to be any upgrades available.`)
          return
        }

        var releaseMsg
        if (uploadedItems.length === 1) {
          releaseMsg = uploadedItems[0]
        } else if (uploadedItems.length === 2) {
          releaseMsg = `${uploadedItems[0]} and ${uploadedItems[1]}`
        } else {
          releaseMsg = `${uploadedItems.slice(0, -1).join(', ')}, and ${uploadedItems[uploadedItems.length - 1]}`
        }

        bot.reply(message, `<@${message.user}> You're in luck! We have upgrades available for ${releaseMsg}. Give me a minute to set that up...`)

        async.parallel([
          function (cb) {
            if (releasesToUpload.length === 0) {
              cb(null, [])
              return
            }
            convo.applier.upgradeReleases(releasesToUpload, cb)
          },
          function (cb) {
            if (stemcellsToUpload.length === 0) {
              cb(null, [])
              return
            }
            convo.applier.upgradeStemcells(stemcellsToUpload, cb)
          }
        ], function (err, _) {
          if (err) {
            bot.reply(message, `<@${message.user}> Sorry, we hit a glitch trying to apply your upgrades: ${err}.`)
            return
          }
          bot.reply(message, `<@${message.user}> Your tickets have been upgraded! Board the plane by telling me 'deploy DESTINATION'.`)
        })
      })
    })

    if (!convo.disableBackgroundUpgrades) {
      setInterval(function () {
        async.parallel([
          function (cb) {
            convo.checker.upgradeableReleases(function (err, releasesToUpdate) {
              if (err) {
                cb(err)
                return
              }
              if (releasesToUpdate.length === 0) {
                cb(null, [])
                return
              }
              convo.applier.upgradeReleases(releasesToUpdate, cb)
            })
          },
          function (cb) {
            convo.checker.upgradeableStemcells(function (err, stemcellsToUpdate) {
              if (err) {
                cb(err)
                return
              }
              if (stemcellsToUpdate.length === 0) {
                cb(null, [])
                return
              }
              convo.applier.upgradeStemcells(stemcellsToUpdate, cb)
            })
          }
        ],
          function (err, results) {
            if (err) {
              controller.say({
                text: `Sorry folks, we're experiencing some mechanical difficulties: ${err}.`,
                channel: convo.defaultChannel
              })
              return
            }

            var uploadedItems = results[0].concat(results[1]).map(function (r) { return r.displayName })
            if (uploadedItems.length === 0) {
              // say nothing
              return
            }

            var releaseMsg
            if (uploadedItems.length === 1) {
              releaseMsg = uploadedItems[0]
            } else if (uploadedItems.length === 2) {
              releaseMsg = `${uploadedItems[0]} and ${uploadedItems[1]}`
            } else {
              releaseMsg = `${uploadedItems.slice(0, -1).join(', ')}, and ${uploadedItems[uploadedItems.length - 1]}`
            }

            controller.say({
              text: `We've upgraded your tickets with ${releaseMsg}! Board the plane by telling me 'deploy DESTINATION'.`,
              channel: convo.defaultChannel
            })
          })
      }, convo.interval)
    }
  }

  return convo
}

module.exports = UpgradeConvo
