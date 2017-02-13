var semver = require('semver');
var async = require('async');

var BoshRunner = require('./bosh_runner');
var BoshioClient = require('./boshio_client');
var Assets = require('./assets');

function BoshBot(config) {
  var boshbot = {
    env: config.env,
    user: config.user,
    password: config.password,
    deployments: config.deployments,
    // TODO: change releases to an array
    releases: config.releases || [],
    stemcells: config.stemcells || [],
    assets: config.assets,
  }

  // TODO: random tmp dir?
  var assetsDir = '/tmp';

  var boshioClient = BoshioClient();
  var assets = Assets({
    dir: assetsDir,
  });

  config.cwd = assetsDir;
  var runner = BoshRunner(config);
  runner.precheck();

  boshbot.setup = function(controller, defaultChannel, setupCb) {
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
      if (Object.keys(assetsToFetch).length > 0) {
        bot.reply(message, `<@${message.user}> Give us a minute to load your assets onto the plane...`);
      }
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
          var_files: boshbot.deployments[deploymentName].var_files,
        };

        runner.showDiff(deployOpts, function(err, diffOutput) {
          // TODO: check for error

          bot.startConversation(message,function(err,convo) {
            // TODO: check err

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
      if (boshbot.releases.length == 0) {
        cb(null, []);
        return;
      }

      var releaseIDs = boshbot.releases.map(function(release) {
        return release.boshio_id;
      });
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

          var releasesToUpload = boshbot.releases.map(function(release) {
            var boshioID = release.boshio_id;
            var boshioResult = boshioVersions[boshioID];
            var directorResult = directorVersions[release.name] || { version: '0.0.0' };

            // TODO: cleanup semver matching
            while (boshioResult.version.match(/\./g).length < 2) {
              boshioResult.version += '.0';
            }
            while (directorResult.version.match(/\./g).length < 2) {
              directorResult.version += '.0';
            }
            if (semver.gt(boshioResult.version, directorResult.version)) {
              return {
                name: release.name,
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

    controller.updateStemcells = function(cb) {
      if (boshbot.stemcells.length == 0) {
        cb(null, []);
        return;
      }

      var stemcellIDs = boshbot.stemcells.map(function(stemcell) {
        return stemcell.boshio_id;
      });

      boshioClient.getLatestStemcellVersions(stemcellIDs, function(err, boshioVersions) {
        if (err != null) {
          cb(err, []);
          return;
        }

        runner.getLatestStemcellVersions(function(err, directorVersions) {
          if (err != null) {
            cb(err, []);
            return;
          }

          var stemcellsToUpload = boshbot.stemcells.map(function(stemcell) {
            var boshioID = stemcell.boshio_id;
            var boshioResult = boshioVersions[boshioID];
            var directorResult = directorVersions[boshioID] || { version: '0.0.0' };

            // TODO: cleanup semver matching
            boshioVersion = boshioResult.version;
            while (boshioVersion.match(/\./g).length < 2) {
              boshioVersion += '.0';
            }
            directorVersion = directorResult.version;
            while (directorVersion.match(/\./g).length < 2) {
              directorVersion += '.0';
            }
            if (semver.gt(boshioVersion, directorVersion)) {
              return {
                name: boshioResult.name,
                url: boshioResult.url,
                version: boshioResult.version,
              };
            }
            return null;
          }).filter(function(element) { return element != null });

          var stemcellURLsToUpload = stemcellsToUpload.map(function(r) { return r.url; });
          if (stemcellURLsToUpload.length == 0) {
            cb(null, []);
            return;
          }

          runner.uploadStemcells(stemcellURLsToUpload, function(err) {
            if (err != null) {
              cb(err, []);
              return;
            }

            var stemcellNames = stemcellsToUpload.map(function(stemcell) {
              return `${stemcell.name} ${stemcell.version}`;
            });

            cb(null, stemcellNames);
          });
        });
      });
    };

    setInterval(function() {
      async.parallel([
        controller.updateReleases,
        controller.updateStemcells,
      ],
      function(err, results) {
        if (err) {
          controller.say({
            text: `Sorry folks, we're experiencing some mechanical difficulties: ${err}.`,
            channel: defaultChannel,
          });
          return;
        }

        var uploadedItems = results[0].concat(results[1]);
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
          releaseMsg = `${uploadedItems.slice(0,-1).join(', ')}, and ${uploadedItems[-1]}`;
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
        controller.updateReleases,
        controller.updateStemcells,
      ],
      function(err, results) {
        if (err) {
          bot.reply(message, `<@${message.user}> Sorry, we hit a glitch trying to check for upgrades: ${err}.`);
          return;
        }

        var uploadedItems = results[0].concat(results[1]);
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
          releaseMsg = `${uploadedItems.slice(0,-1).join(', ')}, and ${uploadedItems[-1]}`;
        }

        bot.reply(message, `<@${message.user}> We've upgraded your tickets with ${releaseMsg}! Board the plane by telling me 'deploy DESTINATION'.`);
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

function pickKeys(obj, keys) {
  var result = {};
  keys.forEach(function(key) {
    result[key] = obj[key];
  });
  return result;
}

module.exports = BoshBot;
