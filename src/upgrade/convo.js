var async = require('async')

function UpgradeConvo (config) {
  var convo = {
    interval: config.interval,
    checker: config.checker,
    applier: config.applier,
    notificationChannel: config.notificationChannel,
    disableBackgroundUpgrades: (config.notificationChannel == null),
    personality: config.personality
  }

  convo.addListeners = function (controller) {
    controller.hears(convo.personality.text('upgrade_trigger'), ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
      var text = convo.personality.reply({ user: message.user, key: 'upgrade_check_starting' })
      bot.reply(message, text)
      async.parallel([
        convo.checker.upgradeableReleases,
        convo.checker.upgradeableStemcells
      ],
      function (err, results) {
        if (err) {
          var text = convo.personality.reply({ user: message.user, key: 'upgrade_check_error', args: [err] })
          bot.reply(message, text)
          return
        }

        var releasesToUpload = results[0]
        var stemcellsToUpload = results[1]

        var uploadedItems = releasesToUpload.concat(stemcellsToUpload).map(function (r) { return r.displayName })
        if (uploadedItems.length === 0) {
          text = convo.personality.reply({ user: message.user, key: 'upgrade_check_none_available' })
          bot.reply(message, text)
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

        text = convo.personality.reply({ user: message.user, key: 'upgrade_apply_starting', args: [releaseMsg] })
        bot.reply(message, text)

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
            var text = convo.personality.reply({ user: message.user, key: 'upgrade_apply_error', args: [err] })
            bot.reply(message, text)
            return
          }
          text = convo.personality.reply({ user: message.user, key: 'upgrade_apply_finished' })
          bot.reply(message, text)
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
                text: convo.personality.say({ key: 'upgrade_apply_error', args: [err] }),
                channel: convo.notificationChannel
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
              text: convo.personality.say({ key: 'upgrade_apply_finished', args: [releaseMsg] }),
              channel: convo.notificationChannel
            })
          })
      }, convo.interval)
    }
  }

  return convo
}

module.exports = UpgradeConvo
