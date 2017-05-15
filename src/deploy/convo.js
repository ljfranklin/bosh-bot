
function DeployConvo (config = {}) {
  var convo = {
    personality: config.personality,
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
        var knownDeploymentNames = convo.deployments.map(function (d) { return `*${d.name}*` }).join(', ')
        var text = convo.personality.reply({ user: message.user, key: 'deploy_unknown_error', args: [deploymentName, knownDeploymentNames] })
        bot.reply(message, text)
        return
      }

      var assetsToFetch = deployment.assets.map(function (assetName) {
        return convo.assets.find(function (a) { return a.name === assetName })
      })
      if (assetsToFetch.length > 0) {
        var text = convo.personality.reply({ user: message.user, key: 'deploy_starting' })
        bot.reply(message, text)
      }
      convo.assetsFetcher.fetchAll(assetsToFetch, function (assetsErr) {
        if (assetsErr) {
          var text = convo.personality.reply({ user: message.user, key: 'deploy_starting_error', args: [assetsErr] })
          bot.reply(message, text)
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
            var text = convo.personality.reply({ user: message.user, key: 'deploy_starting_error', args: [err] })
            bot.reply(message, text)
            return
          }

          bot.startConversation(message, function (err, conversation) {
            if (err) {
              var text = convo.personality.reply({ user: message.user, key: 'deploy_starting_error', args: [err] })
              bot.reply(message, text)
              return
            }

            var prompt = convo.personality.reply({ user: message.user, key: 'deploy_start_prompt', args: [diffOutput] })
            conversation.ask(prompt, [{ pattern: 'takeoff',
              callback: function (response, conversation) {
                var taskID = null
                var taskStarted = function (id, cancelCb) {
                  taskID = id

                  var cancelPrompt = convo.personality.reply({ user: message.user, key: 'deploy_cancel_prompt', args: [taskID] })
                  conversation.ask(cancelPrompt, [{ pattern: 'mayday',
                    callback: function (response, conversation) {
                      var text = convo.personality.reply({ user: message.user, key: 'deploy_canceling' })
                      conversation.say(text)
                      cancelCb()
                      conversation.next()
                    }}])
                  conversation.next()
                }

                var taskEnded = function (err) {
                  var response
                  if (err == null) {
                    response = convo.personality.reply({ user: message.user, key: 'deploy_finished' })
                  } else if (taskID != null) {
                    response = convo.personality.reply({ user: message.user, key: 'deploy_failed_with_task_id', args: [taskID] })
                  } else {
                    response = convo.personality.reply({ user: message.user, key: 'deploy_failed_immediately', args: [err] })
                  }

                  bot.reply(message, response)

                  if (conversation.isActive()) {
                    conversation.stop()
                  }
                }
                convo.runner.deploy(deployOpts, taskStarted, taskEnded)
              }}, { default: true,
                callback: function (response, conversation) {
                  var text = convo.personality.reply({ user: message.user, key: 'deploy_not_confirmed' })
                  conversation.say(text)
                  conversation.next()
                }}])
          })
        })
      })
    })

    controller.hears('takeoff', ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
      var text = convo.personality.reply({ user: message.user, key: 'deploy_not_in_progress' })
      bot.reply(message, text)
    })
  }

  return convo
}

module.exports = DeployConvo
