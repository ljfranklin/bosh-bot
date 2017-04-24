function ExampleBot () {
}

ExampleBot.prototype.setup = function (controller) {
  controller.hears('hello', ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
    bot.reply(message, 'Hello yourself.')
  })

  controller.hears('ping', ['direct_message', 'direct_mention', 'mention'], function (bot, message) {
    bot.reply(message, `<@${message.user}> pong`)
  })

  controller.hears(['pizzatime'], ['ambient'], function (bot, message) {
    var botName = bot.identity.name
    var mentionRegex = new RegExp(`@${botName}\\s+`)

    var askFlavor = function (_, convo) {
      var user = convo.source_message.user
      convo.ask(`<@${user}> What flavor of pizza do you want?`, function (response, convo) {
        response.text = response.text.replace(mentionRegex, '')

        convo.say(`<@${user}> Okay, one *${response.text}*.`)
        askSize(response, convo)
        convo.next()
      }, { key: 'flavor' })
    }
    var askSize = function (response, convo) {
      convo.ask(`<@${response.user}> What size?`, function (response, convo) {
        response.text = response.text.replace(mentionRegex, '')

        convo.say(`<@${response.user}> Your *${response.text} ${convo.responses.flavor.text}* pizza will be ready shortly.`)
        convo.next()
      })
    }

    bot.startConversation(message, askFlavor)
  })
}

module.exports = ExampleBot
