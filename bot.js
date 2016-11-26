var yaml = require('js-yaml');
var Botkit = require('botkit');
var BoshBot = require('./src/bosh_bot');

console.log('Spinning up...');

var rawConfig = process.env.BOSH_BOT_CONFIG;
if (!rawConfig) {
  // TODO: show example format or steps
  console.error('Error: Set BOSH_BOT_CONFIG in your environment.');
  process.exit(1);
}

// TODO: config validation
var config = yaml.safeLoad(rawConfig);

// TODO: verify all manifest paths exist

var token = config.slack.token;
if (!token) {
  console.error('Error: Set `slack.token` in your config. Info: https://api.slack.com/bot-users');
  process.exit(1);
}

console.log('Starting bot...');
var controller = Botkit.slackbot({
  debug: false,
  retry: 10
});

var bot = new BoshBot(config.bosh);
bot.setup(controller);

controller.spawn({
  token: token
}).startRTM();
