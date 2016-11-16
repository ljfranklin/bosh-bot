function BoshBot(config) {
  var boshbot = {
    envURL: config.envURL,
  }

  boshbot.setup = function(controller) {
    controller.hears('hello',['direct_message','direct_mention','mention'],function(bot,message) {
      bot.reply(message, `<@${message.user}> Hello yourself.`);
    });

    controller.hears('ping',['direct_message','direct_mention','mention'],function(bot,message) {
      bot.reply(message, `<@${message.user}> pong`);
    });

    controller.hears('env',['direct_message','direct_mention','mention'],function(bot,message) {
      bot.reply(message, `<@${message.user}> Currently targeting *${boshbot.envURL}*.`);
    });
  };

  return boshbot;
}

module.exports = BoshBot;
