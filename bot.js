var fs = require('fs');
var spawnSync = require('child_process').spawnSync;
var spawn = require('child_process').spawn;
var yaml = require('js-yaml');

var Botkit = require('botkit');

console.log('Spinning up...');

var rawConfig = process.env.BOSH_BOT_CONFIG;
if (!rawConfig) {
  // TODO: show example format or steps
  console.error('Error: Set BOSH_BOT_CONFIG in your environment.');
  process.exit(1);
}
// TODO: config validation
var config = yaml.safeLoad(rawConfig);
var boshEnv = {
  BOSH_ENVIRONMENT: config.bosh.env,
  BOSH_USER:        config.bosh.user,
  BOSH_PASSWORD:    config.bosh.password,
  PATH:             process.env.PATH,
};

var token = config.slack.token;
if (!token) {
  console.error('Error: Set `slack.token` in your config. Info: https://api.slack.com/bot-users');
  process.exit(1);
}
var manifestPath = config.bosh.manifest_path;
if (!fs.existsSync(manifestPath)) {
  console.error(`Error: Manifest path '${manifestPath}' does not exist`);
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

controller.hears('deploy ([a-zA-Z0-9\-\_]+)',['direct_message','direct_mention','mention'],function(bot,message) {
  var deploymentName = message.match[1];
  bot.reply(message, `Deploying '${deploymentName}' to '${config.bosh.env}'...`);

  var boshProcess = spawn('bosh', ['-n', '--no-color', '--tty', 'deploy', '-d', deploymentName, manifestPath], {env: boshEnv});
  var taskNumber = null;
  var boshOutput = [];

  boshProcess.stdout.on('data', function(data) {
    data = data.toString();
    boshOutput.push(data);
    matches = data.match(/Task ([0-9]+)/i)
    if (taskNumber == null && matches) {
      taskNumber = matches[1];
      bot.reply(message, `We're off! Run \`bosh task ${taskNumber}\` to follow along.`);
    }
  });
  boshProcess.stderr.on('data', function(data) {
    data = data.toString();
    boshOutput.push(data);
  });

  boshProcess.on('close', function(code) {
    if (code === 0) {
      bot.reply(message, `Another successful landing, the deploy is finished!`);
    } else if (taskNumber === null) {
      bot.reply(message, `Apologies for the delay folks. We need to fix a mechanical problem before take-off.\nReport: ${boshOutput.join('\n')}`);
    } else {
      bot.reply(message, `Oh no, we had to make an emergency landing! Run \`bosh task ${taskNumber}\` to see the blackbox.`);
    }
  });
  // TODO: periodically reply with task runtime
});
