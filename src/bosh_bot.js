var semver = require('semver');

var BoshRunner = require('./bosh_runner');
var BoshioClient = require('./boshio_client');
var Assets = require('./assets');

function BoshBot(config) {
  var boshbot = {
    env: config.env,
    user: config.user,
    password: config.password,
    deployments: config.deployments,
    releasesToUpdate: config.releases_to_update,
    assets: config.assets,
  }

  var runner = BoshRunner(config);
  runner.precheck();

  var boshioClient = BoshioClient();
  // TODO: random tmp dir?
  var assets = Assets({
    dir: '/tmp',
  });

  boshbot.setup = function(controller, defaultChannel, cb) {
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
      var deploymentName = message.match[1];

      if (boshbot.deployments.hasOwnProperty(deploymentName) == false) {
        var knownDeploymentNames = Object.keys(boshbot.deployments).map(function(val) { return `*${val}*`; });
        bot.reply(message, `<@${message.user}> I'm afraid my navigator doesn't know the destination *${deploymentName}*. The destinations we know about are: ${knownDeploymentNames.join(', ')}.`);
        return;
      }

      var assetsToFetch = pickKeys(boshbot.assets, boshbot.deployments[deploymentName].assets)
      assets.fetchAll(assetsToFetch, function(assetsErr) {
        if (assetsErr) {
          bot.reply(message, `<@${message.user}> Ran into an issue loading the plane: ${assetsErr}.`);
          return;
        }

        // TODO: validation, err handling
        var deployOpts = {
          name: deploymentName,
          manifest_path: boshbot.deployments[deploymentName].manifest_path,
          vars: boshbot.deployments[deploymentName].vars,
        };

        runner.showDiff(deployOpts, function(err, stdout, stderr) {

          bot.startConversation(message,function(err,convo) {

            var prompt = `<@${message.user}> Here's our flight plan for today:\n*${stdout}*\nRespond with *'takeoff'* when you're ready!`;
            convo.ask(prompt, [{ pattern: 'takeoff', callback: function(response,convo) {
              var taskID = null;
              var taskStarted = function(id, cancelCb) {
                taskID = id;

                var cancelPrompt = `<@${message.user}> We're off! Run \`bosh task ${taskID}\` to track the flight, and respond with *'mayday'* to perform an emergency landing.`;
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
            }}, { default: true, callback: function(response, convo) {
              convo.say(`<@${message.user}> I guess you don't want to *'takeoff'* after all...`);
              convo.next();
            }}]);
          });
        });
      });
    });

    controller.hears('takeoff',['direct_message','direct_mention','mention'],function(bot,message) {
      bot.reply(message, `<@${message.user}> Let me know our destination with *'deploy DESTINATION'*.`);
    });

    controller.updateReleases = function(cb) {
      var releaseIDs = Object.keys(boshbot.releasesToUpdate).map(function(name) {
        return boshbot.releasesToUpdate[name].boshio_id;
      });
      var releaseNames = Object.keys(boshbot.releasesToUpdate);

      boshioClient.getLatestReleaseVersions(releaseIDs, function(err, boshioVersions) {
        if (err != null) {
          cb(err, []);
          return;
        }

        runner.getLatestReleaseVersions(function(err, directorVersions) {
          if (err != null) {
            cb(err, []);
            return;
          }

          var releasesToUpload = Object.keys(boshbot.releasesToUpdate).map(function(releaseName) {
            var boshioID = boshbot.releasesToUpdate[releaseName].boshio_id;
            var boshioResult = boshioVersions[boshioID];
            var directorResult = directorVersions[releaseName] || { version: '0.0.0' };

            if (semver.gt(boshioResult.version, directorResult.version)) {
              return {
                name: releaseName,
                url: boshioResult.url,
                version: boshioResult.version,
              };
            }
            return null;
          }).filter(function(element) { return element != null });

          var releaseURLsToUpload = releasesToUpload.map(function(r) { return r.url; });
          if (releaseURLsToUpload.length == 0) {
            cb(null, []);
            return;
          }

          runner.uploadReleases(releaseURLsToUpload, function(err) {
            if (err != null) {
              cb(err, []);
              return;
            }

            var releaseNames = releasesToUpload.map(function(release) {
              return `${release.name} ${release.version}`;
            });

            cb(null, releaseNames);
          });
        });
      });
    };

    setInterval(function() {
      controller.updateReleases(function(err, uploadedReleaseNames) {
        if (err) {
          controller.say({
            text: `Sorry folks, we're experiencing some mechanical difficulties: ${err}.`,
            channel: defaultChannel,
          });
          return;
        }

        if (uploadedReleaseNames.length == 0) {
          // say nothing
          return;
        }

        var releaseMsg;
        if (uploadedReleaseNames.length == 1) {
          releaseMsg = uploadedReleaseNames[0];
        } else if (uploadedReleaseNames.length == 2) {
          releaseMsg = `${uploadedReleaseNames[0]} and ${uploadedReleaseNames[1]}`;
        } else {
          releaseMsg = `${uploadedReleaseNames.slice(0,-1).join(', ')}, and ${uploadedReleaseNames[-1]}`;
        }

        controller.say({
          text: `We've upgraded your tickets with ${releaseMsg}! Board the plane by telling me 'deploy DESTINATION'.`,
          channel: defaultChannel,
        });
      });
    }, 60 * 60 * 1000);

    controller.hears('upgrade',['direct_message','direct_mention','mention'],function(bot,message) {
      bot.reply(message, `<@${message.user}> Let's see if any flight upgrades are available...`);
      controller.updateReleases(function(err, uploadedReleaseNames) {
        if (err) {
          bot.reply(message, `<@${message.user}> Sorry, we hit a glitch trying to check for upgrades: ${err}.`);
          return;
        }

        if (uploadedReleaseNames.length == 0) {
          bot.reply(message, `<@${message.user}> I'm sorry, there don't appear to be any upgrades available.`);
          return;
        }

        var releaseMsg;
        if (uploadedReleaseNames.length == 1) {
          releaseMsg = uploadedReleaseNames[0];
        } else if (uploadedReleaseNames.length == 2) {
          releaseMsg = `${uploadedReleaseNames[0]} and ${uploadedReleaseNames[1]}`;
        } else {
          releaseMsg = `${uploadedReleaseNames.slice(0,-1).join(', ')}, and ${uploadedReleaseNames[-1]}`;
        }

        bot.reply(message, `<@${message.user}> We've upgraded your tickets with ${releaseMsg}! Board the plane by telling me 'deploy DESTINATION'.`);
        return;
      });
    });

    controller.hears('.*',['direct_message','direct_mention','mention'],function(bot,message) {
      bot.reply(message, `<@${message.user}> Sorry, didn't catch that...`);
    });

    assets.fetchAll(boshbot.assets, cb);
  };

  return boshbot;
}

function pickKeys(obj, keys) {
  var result = {};
  keys.forEach(function(key) {
    result[key] = obj[key];
  });
  return result;
}

module.exports = BoshBot;
