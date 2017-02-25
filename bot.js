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

var bot = new BoshBot(config.get('bosh'));
bot.setup(controller, 'general', function(err) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  controller.spawn({
    token: config.get('slack.token'),
    retry: Infinity,
  }).startRTM();
  console.log('Ready for connections!');
});

