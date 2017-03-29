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
slackbot.startRTM(function(err,bot,response) {
  if (err) {
    console.error(err);
    process.exit(1);
  }

  var usernamesToIDs = [];
  response.users.forEach(function(member) {
    usernamesToIDs[member.name] = member.id;
  });

  config.get('bosh').authorizedUserIDs = [];
  config.get('slack').authorized_usernames.forEach(function(name) {
    if (usernamesToIDs[name]) {
      config.get('bosh').authorizedUserIDs.push(usernamesToIDs[name]);
    } else {
      console.error(new Error(`Couldn't find a Slack user with username '${name}'`));
      process.exit(1);
    }
  });

  var channelNamesToIDs = [];
  response.channels.forEach(function(channel) {
    channelNamesToIDs[channel.name] = channel.id;
  });

  config.get('bosh').authorizedChannelIDs = [];
  (config.get('slack').authorized_channels || []).forEach(function(name) {
    if (channelNamesToIDs[name]) {
      config.get('bosh').authorizedChannelIDs.push(channelNamesToIDs[name]);
    } else {
      console.error(new Error(`Couldn't find a Slack channel with name '${name}'`));
      process.exit(1);
    }
  });

  var notificationChannel = config.get('slack').notification_channel || 'general'
  var bot = new BoshBot(config.get('bosh'));
  bot.setup(controller, notificationChannel, function(err) {
    if (err) {
      console.error(err);
      process.exit(1);
    }

    console.log('Ready for connections!');
  });
});

