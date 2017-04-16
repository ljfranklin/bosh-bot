var semver = require('semver');
var async = require('async');

var BoshRunner = require('./bosh_runner');
var BoshioClient = require('./boshio_client');
var Assets = require('./assets');
var UpgradeChecker = require('./upgrade/checker');
var UpgradeApplier = require('./upgrade/applier');

function BoshBot(config) {
  var boshbot = {
    env: config.env,
    user: config.user,
    password: config.password,
    deployments: config.deployments || [],
    releases: config.releases || [],
    stemcells: config.stemcells || [],
    assets: config.assets || [],
    authorizedUserIDs: config.authorizedUserIDs || [],
    authorizedChannelIDs: config.authorizedChannelIDs || [],
  };

  // TODO: random tmp dir?
  var assetsDir = '/tmp';

  var boshioClient = BoshioClient();
  var assets = Assets({
    dir: assetsDir,
  });

  config.cwd = assetsDir;
  var runner = BoshRunner(config);
  runner.precheck();

  var checker = UpgradeChecker({
    boshRunner: runner,
    boshioClient: boshioClient,
    stemcells: config.stemcells,
    releases: config.releases,
  });

  var upgrader = UpgradeApplier({
    boshRunner: runner,
  });

  boshbot.setup = function(controller, defaultChannel, setupCb) {
    controller.middleware.heard.use(function(bot, message, next) {
      if (boshbot.authorizedChannelIDs.length > 0 && boshbot.authorizedChannelIDs.includes(message.channel) == false) {
        // do not response
        return;
      }

      if (boshbot.authorizedUserIDs.includes(message.user)) {
        next();
      } else {
        bot.reply(message, `<@${message.user}> I'm afraid you don't have a ticket for this flight. Please see one of our authorized staff to get this sorted out.`);
      }
    });

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

      var deployment = boshbot.deployments.find(function(d) {
        return (d.name == deploymentName);
      });

      if (deployment == null) {
        var knownDeploymentNames = boshbot.deployments.map(function(d) { return `*${d.name}*`; });
        bot.reply(message, `<@${message.user}> I'm afraid my navigator doesn't know the destination *${deploymentName}*. The destinations we know about are: ${knownDeploymentNames.join(', ')}.`);
        return;
      }

      var assetsToFetch = deployment.assets.map(function(assetName) {
        return boshbot.assets.find(function(a) { return a.name == assetName });
      });
      if (assetsToFetch.length > 0) {
        bot.reply(message, `<@${message.user}> Give us a minute to load your assets onto the plane...`);
      }
      assets.fetchAll(assetsToFetch, function(assetsErr) {
        if (assetsErr) {
          bot.reply(message, `<@${message.user}> Ran into an issue loading the plane: ${assetsErr}.`);
          return;
        }

        var deployOpts = {
          name: deploymentName,
          manifest_path: deployment.manifest_path,
          vars: deployment.vars,
          var_files: deployment.var_files,
          vars_files: deployment.vars_files,
          ops_files: deployment.ops_files,
          vars_store: deployment.vars_store,
        };

        runner.showDiff(deployOpts, function(err, diffOutput) {
          if (err) {
            bot.reply(message, `<@${message.user}> Ran into an issue loading the plane: ${err}.`);
            return;
          }

          bot.startConversation(message,function(err,convo) {
            if (err) {
              bot.reply(message, `<@${message.user}> Ran into an issue loading the plane: ${err}.`);
              return;
            }

            var prompt = `<@${message.user}> Here's our flight plan for today:\n*${diffOutput}*\nRespond with *'takeoff'* when you're ready!`;
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

              var taskEnded = function(err, shouldRedact) {
                var response;
                if (err == null) {
                  response = `Another successful landing, the deploy is finished!`;
                } else if (taskID != null) {
                  response = `Oh no, we had to make an emergency landing! Run \`bosh task ${taskID}\` to see the blackbox.`;
                } else {
                  response = 'Apologies for the delay folks. We need to fix a mechanical problem before take-off.';
                }
                if (err && shouldRedact == false) {
                  response += `\nReport: ${err}`
                }

                bot.reply(message, `<@${message.user}> ${response}`);

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

    setInterval(function() {
      async.parallel([
        function(cb) {
          checker.upgradeableReleases(function(err, releasesToUpdate) {
            if (err) {
              cb(err);
              return;
            }
            if (releasesToUpdate.length == 0) {
              cb(null, []);
              return;
            }
            upgrader.upgradeReleases(releasesToUpdate, cb);
          });
        },
        function(cb) {
          checker.upgradeableStemcells(function(err, stemcellsToUpdate) {
            if (err) {
              cb(err);
              return;
            }
            if (stemcellsToUpdate.length == 0) {
              cb(null, []);
              return;
            }
            upgrader.upgradeStemcells(stemcellsToUpdate, cb);
          });
        },
      ],
      function(err, results) {
        if (err) {
          controller.say({
            text: `Sorry folks, we're experiencing some mechanical difficulties: ${err}.`,
            channel: defaultChannel,
          });
          return;
        }

        var uploadedItems = results[0].concat(results[1]).map(function(r) { return r.displayName });
        if (uploadedItems.length == 0) {
          // say nothing
          return;
        }

        var releaseMsg;
        if (uploadedItems.length == 1) {
          releaseMsg = uploadedItems[0];
        } else if (uploadedItems.length == 2) {
          releaseMsg = `${uploadedItems[0]} and ${uploadedItems[1]}`;
        } else {
          releaseMsg = `${uploadedItems.slice(0,-1).join(', ')}, and ${uploadedItems[uploadedItems.length - 1]}`;
        }

        controller.say({
          text: `We've upgraded your tickets with ${releaseMsg}! Board the plane by telling me 'deploy DESTINATION'.`,
          channel: defaultChannel,
        });
      });
    }, 60 * 60 * 1000);

    controller.hears('upgrade',['direct_message','direct_mention','mention'],function(bot,message) {
      bot.reply(message, `<@${message.user}> Let's see if any flight upgrades are available...`);
      async.parallel([
        checker.upgradeableReleases,
        checker.upgradeableStemcells,
      ],
      function(err, results) {
        if (err) {
          bot.reply(message, `<@${message.user}> Sorry, we hit a glitch trying to check for upgrades: ${err}.`);
          return;
        }

        var releasesToUpload = results[0];
        var stemcellsToUpload = results[1];

        var uploadedItems = releasesToUpload.concat(stemcellsToUpload).map(function(r) { return r.displayName });
        if (uploadedItems.length == 0) {
          bot.reply(message, `<@${message.user}> I'm sorry, there don't appear to be any upgrades available.`);
          return;
        }

        var releaseMsg;
        if (uploadedItems.length == 1) {
          releaseMsg = uploadedItems[0];
        } else if (uploadedItems.length == 2) {
          releaseMsg = `${uploadedItems[0]} and ${uploadedItems[1]}`;
        } else {
          releaseMsg = `${uploadedItems.slice(0,-1).join(', ')}, and ${uploadedItems[uploadedItems.length - 1]}`;
        }

        bot.reply(message, `<@${message.user}> You're in luck! We have upgrades available for ${releaseMsg}. Give me a minute to set that up...`);

        async.parallel([
          function(cb) {
            if (releasesToUpload.length == 0) {
              cb(null, []);
              return;
            }
            upgrader.upgradeReleases(releasesToUpload, cb);
          },
          function(cb) {
            if (stemcellsToUpload.length == 0) {
              cb(null, []);
              return;
            }
            upgrader.upgradeStemcells(stemcellsToUpload, cb);
          },
        ], function(err, _) {
          bot.reply(message, `<@${message.user}> Your tickets have been upgraded! Board the plane by telling me 'deploy DESTINATION'.`);
        });

        return;
      });
    });

    controller.hears('.*',['direct_message','direct_mention','mention'],function(bot,message) {
      bot.reply(message, `<@${message.user}> Sorry, didn't catch that...`);
    });

    assets.fetchAll(boshbot.assets, setupCb);
  };

  return boshbot;
}

module.exports = BoshBot;
