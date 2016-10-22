var spawnSync = require('child_process').spawnSync;
var yaml = require('js-yaml');

var Botkit = require('botkit');
var GitClient = require('./src/git');

console.log('Spinning up...');

var rawConfig = process.env.BOSH_BOT_CONFIG;
if (!rawConfig) {
  // TODO: show example format or steps
  console.error('Error: Set BOSH_BOT_CONFIG in your environment.');
  process.exit(1);
}
var config = yaml.safeLoad(rawConfig);

var token = config.slack.token;
if (!token) {
  console.error('Error: Set `slack.token` in your config. Info: https://api.slack.com/bot-users');
  process.exit(1);
}

if (spawnSync('which', ['bosh']).status != 0) {
  console.error('Error: Cannot find executate `bosh` in PATH. Grab the CLI from here: https://github.com/cloudfoundry/bosh-cli.');
  process.exit(1);
}

console.log('Starting bot...');
var controller = Botkit.slackbot({
  debug: false,
  retry: 10
});
controller.spawn({
  token: token
}).startRTM();

controller.hears('hello',['direct_message','direct_mention','mention'],function(bot,message) {
  bot.reply(message, 'Hello yourself.');
});

controller.hears('env(ironment)?$',['direct_message','direct_mention','mention'],function(bot,message) {
  bot.reply(message, `Currently targeting '${config.bosh.env}'`);
});
