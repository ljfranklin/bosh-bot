var yaml = require('js-yaml');
var fs = require('fs');
var Botkit = require('botkit');
var BoshBot = require('./src/bosh_bot');
var Config = require('./src/config');

console.log('Spinning up...');

var configPath = process.env.BOSH_BOT_CONFIG;
if (!configPath) {
  // TODO: show example format or steps
  console.error('Error: Set BOSH_BOT_CONFIG in your environment.');
  process.exit(1);
}

var config = Config(configPath);
var loadErr = config.loadSync();
if (loadErr) {
  console.error(`Invalid Config: ${loadErr}`);
  process.exit(1);
}

console.log('Starting bot...');
var controller = Botkit.slackbot({
  debug: false,
  retry: 10
});
slackbot = controller.spawn({
  token: config.get('slack.token'),
  retry: Infinity,
});
slackbot.startRTM(function(err) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  slackbot.api.users.list({}, function(err, response) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    // TODO: throw error if name not found
    var usernamesToIDs = [];
    response.members.forEach(function(member) {
      usernamesToIDs[member.name] = member.id;
    });

    config.get('bosh').authorizedUserIDs = [];
    config.get('slack').authorizedUsernames.forEach(function(name) {
      config.get('bosh').authorizedUserIDs.push(usernamesToIDs[name]);
    });

    var bot = new BoshBot(config.get('bosh'));
    bot.setup(controller, 'general', function(err) {
      if (err) {
        console.error(err);
        process.exit(1);
      }

      console.log('Ready for connections!');
    });
  });
});

