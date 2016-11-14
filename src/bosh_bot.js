function BoshBot() {
}

BoshBot.prototype.setup = function(controller) {
  controller.hears('hello',['direct_message','direct_mention','mention'],function(bot,message) {
    bot.reply(message, `<@${message.user}> Hello yourself.`);
  });

  controller.hears('ping',['direct_message','direct_mention','mention'],function(bot,message) {
    bot.reply(message, `<@${message.user}> pong`);
  });
};

module.exports = BoshBot;
