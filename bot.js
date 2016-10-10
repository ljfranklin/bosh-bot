var spawnSync = require('child_process').spawnSync;
var spawn = require('child_process').spawn;
var fs = require('fs');
var path = require('path');

var Botkit = require('botkit');
var GitClient = require('./src/git');
var tmp = require('tmp');
var async = require('async');

console.log('Spinning up...');

var token = process.env.BOSH_BOT_SLACK_TOKEN;
if (!token) {
  console.error('Error: Set BOSH_BOT_SLACK_TOKEN in your environment. Info: https://api.slack.com/bot-users');
  process.exit(1);
}
var manifestPath = process.env.BOSH_BOT_MANIFEST_PATH;
if (!manifestPath) {
  console.error('Error: Set BOSH_BOT_MANIFEST_PATH in your environment. This path should be relative to the root of the git repo.');
  process.exit(1);
}

if (spawnSync('which', ['bosh']).status != 0) {
  console.error('Error: Cannot find executate `bosh` in PATH. Grab the CLI from here: https://github.com/cloudfoundry/bosh-cli.');
  process.exit(1);
}

var tmpobj = tmp.dirSync({ unsafeCleanup: true });
tmp.setGracefulCleanup();
var tmpdir = tmpobj.name;

var git = new GitClient(tmpdir);

gitClone()
fileExists()
start()

async.waterfall([
  function(cb) {
    console.log('Cloning git repo...');
    git.clone({ uri: 'https://github.com/ljfranklin/deployments', branch: 'master' }, function(repo) {
      fs.stat(path.join(repo.path(), manifestPath), function(err) {
        if (err) {
          return cb(new Error(`Unable to find a manifest at '${manifestPath}'`), null);
        }
        cb(null, repo);
      });
    });
  },
  function(repo, cb) {
    console.log('Starting bot...');
    var controller = Botkit.slackbot({
      debug: false,
      retry: 10
    });
    controller.spawn({
      token: token
    }).startRTM()

    controller.hears('hello',['direct_message','direct_mention','mention'],function(bot,message) {
      bot.reply(message, 'Hello yourself.');
    });

    controller.hears('version',['direct_message','direct_mention','mention'],function(bot,message) {
      bosh_output = []
      bosh_process = spawn('bosh', ['-v'])
      bosh_process.stdout.on('data', function(data) {
        bosh_output.push(data);
      });
      bosh_process.stderr.on('data', function(data) {
        bosh_output.push(data);
      });

      bosh_process.on('close', function(code) {
        bot.reply(message, `${bosh_output.join('\n')}\Finished with exit code *${code}*`);
      });
    });

    controller.hears('deploy ([A-Za-z0-9_\-]+)', ['direct_message','direct_mention','mention'],function(bot,message) {
      var deploymentName = message.match[1];
      var absManifestPath = path.join(repo.path(), manifestPath);

      // TODO: pull repo here

      bosh_output = []
      bosh_process = spawn('bosh', ['build-manifest', absManifestPath])
      bosh_process.stdout.on('data', function(data) {
        bosh_output.push(data);
      });
      bosh_process.stderr.on('data', function(data) {
        bosh_output.push(data);
      });

      bosh_process.on('close', function(code) {
        bot.reply(message, `${bosh_output.join('\n')}\Finished with exit code *${code}*`);
      });
    });

    controller.hears('convo',['direct_message','direct_mention','mention'],function(bot,message) {
      bot.createConversation(message, function(err, convo) {
        convo.task.timeLimit = 30000 // 30 seconds
        convo.addMessage({
          text: `<@${message.user}> You said yes! How wonderful.`,
        },'yes_thread');

        convo.addMessage({
          text: `<@${message.user}> You said no, that is too bad.`,
        },'no_thread');

        convo.addMessage({
          text: `<@${message.user}> Sorry I did not understand.`,
          action: 'default',
        },'bad_response');

        convo.ask(`<@${message.user}> Do you like cheese?`, [
          {
              pattern: bot.utterances.yes,
              callback: function(response, convo) {
                  convo.changeTopic('yes_thread');
              },
          },
          {
              pattern: bot.utterances.no,
              callback: function(response, convo) {
                  convo.changeTopic('no_thread');
              },
          },
          {
              default: true,
              callback: function(response, convo) {
                  convo.changeTopic('bad_response');
              },
          }
        ]);

        convo.on('end', function(convo) {
          if (convo.status == 'timeout') {
            bot.reply(message, `<@${message.user}> Timed out...`);
          }
        });

        convo.activate();
      });
    });

    cb(null);
  }
], function(err) {
  if (err) {
    console.error(err);
    process.exit(1);
  }
});
