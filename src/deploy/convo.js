
function DeployConvo (config = {}) {
  var convo = {
    deployments: config.deployments,
    assetsFetcher: config.assetsFetcher,
    assets: config.assets,
    runner: config.runner
  }

  convo.addListeners = function (controller) {
    controller.hears('deploy ([a-zA-Z0-9-_]+)', ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
      var deploymentName = message.match[1]

      var deployment = convo.deployments.find(function (d) {
        return (d.name === deploymentName)
      })

      if (deployment == null) {
        var knownDeploymentNames = convo.deployments.map(function (d) { return `*${d.name}*` })
        bot.reply(message, `<@${message.user}> I'm afraid my navigator doesn't know the destination *${deploymentName}*. The destinations we know about are: ${knownDeploymentNames.join(', ')}.`)
        return
      }

      var assetsToFetch = deployment.assets.map(function (assetName) {
        return convo.assets.find(function (a) { return a.name === assetName })
      })
      if (assetsToFetch.length > 0) {
        bot.reply(message, `<@${message.user}> Give us a minute to load your assets onto the plane...`)
      }
      convo.assetsFetcher.fetchAll(assetsToFetch, function (assetsErr) {
        if (assetsErr) {
          bot.reply(message, `<@${message.user}> Ran into an issue loading the plane: ${assetsErr}.`)
          return
        }

        var deployOpts = {
          name: deploymentName,
          manifest_path: deployment.manifest_path,
          vars: deployment.vars,
          var_files: deployment.var_files,
          vars_files: deployment.vars_files,
          ops_files: deployment.ops_files,
          vars_store: deployment.vars_store
        }

        convo.runner.showDiff(deployOpts, function (err, diffOutput) {
          if (err) {
            bot.reply(message, `<@${message.user}> Ran into an issue loading the plane: ${err}.`)
            return
          }

          bot.startConversation(message, function (err, conversation) {
            if (err) {
              bot.reply(message, `<@${message.user}> Ran into an issue loading the plane: ${err}.`)
              return
            }

            var prompt = `<@${message.user}> Here's our flight plan for today:\n*${diffOutput}*\nRespond with *'takeoff'* when you're ready!`
            conversation.ask(prompt, [{ pattern: 'takeoff',
              callback: function (response, conversation) {
                var taskID = null
                var taskStarted = function (id, cancelCb) {
                  taskID = id

                  var cancelPrompt = `<@${message.user}> We're off! Run \`bosh task ${taskID}\` to track the flight, and respond with *'mayday'* to perform an emergency landing.`
                  conversation.ask(cancelPrompt, [{ pattern: 'mayday',
                    callback: function (response, conversation) {
                      conversation.say(`<@${message.user}> Hold on tight, this may get a little bumpy...`)
                      cancelCb()
                      conversation.next()
                    }}])
                  conversation.next()
                }

                var taskEnded = function (err, shouldRedact) {
                  var response
                  if (err == null) {
                    response = `Another successful landing, the deploy is finished!`
                  } else if (taskID != null) {
                    response = `Oh no, we had to make an emergency landing! Run \`bosh task ${taskID}\` to see the blackbox.`
                  } else {
                    response = 'Apologies for the delay folks. We need to fix a mechanical problem before take-off.'
                  }
                  if (err && shouldRedact === false) {
                    response += `\nReport: ${err}`
                  }

                  bot.reply(message, `<@${message.user}> ${response}`)

                  if (conversation.isActive()) {
                    conversation.stop()
                  }
                }
                convo.runner.deploy(deployOpts, taskStarted, taskEnded)
              }}, { default: true,
                callback: function (response, conversation) {
                  conversation.say(`<@${message.user}> I guess you don't want to *'takeoff'* after all...`)
                  conversation.next()
                }}])
          })
        })
      })
    })

    controller.hears('takeoff', ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
      bot.reply(message, `<@${message.user}> Let me know our destination with *'deploy DESTINATION'*.`)
    })
  }

  return convo
}

module.exports = DeployConvo
