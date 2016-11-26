var spawnSync = require('child_process').spawnSync;
var BoshRunner = require('./bosh_runner');

function BoshBot(config) {
  var boshbot = {
    env: config.env,
    user: config.user,
    password: config.password,
    deployments: config.deployments,
  }

  var runner = BoshRunner(config);

  boshbot.setup = function(controller) {
    controller.hears('hello',['direct_message','direct_mention','mention'],function(bot,message) {
      bot.reply(message, `<@${message.user}> Hello yourself.`);
    });

    controller.hears('ping',['direct_message','direct_mention','mention'],function(bot,message) {
      bot.reply(message, `<@${message.user}> pong`);
    });

    controller.hears('env',['direct_message','direct_mention','mention'],function(bot,message) {
      bot.reply(message, `<@${message.user}> Currently targeting *${boshbot.env}*.`);
    });

    controller.hears('deploy ([a-zA-Z0-9\-\_]+)',['direct_message','direct_mention','mention'],function(bot,message) {
      runner.precheck();

      var deploymentName = message.match[1];

      // TODO: validation, err handling
      var deployOpts = {
        name: deploymentName,
        manifest_path: boshbot.deployments[deploymentName].manifest_path,
        vars_file_contents: boshbot.deployments[deploymentName].vars_file_contents,
      };

      runner.showDiff(deployOpts, function(err, stdout, stderr) {
        bot.startConversation(message,function(err,convo) {

          var prompt = `<@${message.user}> Here's our flight plan for today:\n${stdout}\nRespond with 'takeoff' when you're ready!`;
          convo.ask(prompt, [{ pattern: 'takeoff', callback: function(response,convo) {
            var taskID = null;
            var taskStarted = function(id, cancelCb) {
              taskID = id;

              var cancelPrompt = `<@${message.user}> We're off! Run \`bosh task ${taskID}\` to track the flight, and respond with 'mayday' to perform an emergency landing.`;
              convo.ask(cancelPrompt, [{ pattern: 'mayday', callback: function(response, convo) {
                convo.say(`<@${message.user}> Hold on tight, this may get a little bumpy...`);
                cancelCb();
                convo.next();
              }}]);
              convo.next();
            };

            var taskEnded = function(err) {
              if (err == null) {
                bot.reply(message, `<@${message.user}> Another successful landing, the deploy is finished!`);
              } else if (taskID != null) {
                bot.reply(message, `<@${message.user}> Oh no, we had to make an emergency landing! Run \`bosh task ${taskID}\` to see the blackbox.`);
              } else {
                bot.reply(message, `<@${message.user}> Apologies for the delay folks. We need to fix a mechanical problem before take-off.\nReport: ${err}`);
              }

              if (convo.isActive()) {
                convo.stop();
              }
            };
            runner.deploy(deployOpts, taskStarted, taskEnded);
          }}]);
        });
      });
    });
  };

  return boshbot;
}

module.exports = BoshBot;
