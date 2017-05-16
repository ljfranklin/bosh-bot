function Auth (config = {}) {
  var auth = {
    authorizedChannels: config.authorizedChannels || [],
    authorizedUsers: config.authorizedUsers || [],
    personality: config.personality
  }

  auth.addHandler = function (controller, connectResponse) {
    var usernamesToIDs = []
    connectResponse.users.forEach(function (member) {
      usernamesToIDs[member.name] = member.id
    })

    var authorizedUserIDs = []
    var err = null
    auth.authorizedUsers.forEach(function (name) {
      if (usernamesToIDs[name]) {
        authorizedUserIDs.push(usernamesToIDs[name])
      } else {
        err = new Error(`Couldn't find a Slack user with username '${name}'`)
      }
    })
    if (err) {
      return err
    }

    var channelNamesToIDs = []
    connectResponse.channels.forEach(function (channel) {
      channelNamesToIDs[channel.name] = channel.id
    })

    var authorizedChannelIDs = []
    auth.authorizedChannels.forEach(function (name) {
      if (channelNamesToIDs[name]) {
        authorizedChannelIDs.push(channelNamesToIDs[name])
      } else {
        err = new Error(`Couldn't find a Slack channel with name '${name}'`)
      }
    })
    if (err) {
      return err
    }

    controller.middleware.heard.use(function (bot, message, next) {
      if (authorizedChannelIDs.length > 0 && authorizedChannelIDs.includes(message.channel) === false) {
        // do not response
        return
      }

      if (authorizedUserIDs.includes(message.user)) {
        next()
      } else {
        var text = auth.personality.reply({ user: message.user, key: 'not_authorized_error' })
        bot.reply(message, text)
      }
    })

    return null
  }

  return auth
}

module.exports = Auth
