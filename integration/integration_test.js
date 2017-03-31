var expect = require('chai').expect;
var RtmClient = require('@slack/client').RtmClient;
var CLIENT_EVENTS = require('@slack/client').CLIENT_EVENTS;
var RTM_EVENTS = require('@slack/client').RTM_EVENTS;
var spawn = require('child_process').spawn;
var path = require('path');
var fs = require('fs');

describe('Integration', function() {
  var slackClient;
  var serverBotName;
  var serverBotID;
  var clientBotID;
  var channelID;
  var deploymentName = 'dummy-deployment'; // TODO: random name
  var botProcess;
  var configPath;

  beforeEach(function(done) {
    this.timeout(10000);

    var clientToken = process.env.BOSH_BOT_CI_CLIENT_SLACK_TOKEN;
    if (clientToken == null) {
      throw new Error("BOSH_BOT_CI_CLIENT_SLACK_TOKEN must be set.");
    }
    var serverToken = process.env.BOSH_BOT_CI_SERVER_SLACK_TOKEN;
    if (serverToken == null) {
      throw new Error("BOSH_BOT_CI_SERVER_SLACK_TOKEN must be set.");
    }
    clientBotName = process.env.BOSH_BOT_CI_CLIENT_BOT_NAME;
    if (clientBotName == null) {
      throw new Error("BOSH_BOT_CI_CLIENT_BOT_NAME must be set.");
    }
    serverBotName = process.env.BOSH_BOT_CI_SERVER_BOT_NAME;
    if (serverBotName == null) {
      throw new Error("BOSH_BOT_CI_SERVER_BOT_NAME must be set.");
    }
    var channelName = process.env.BOSH_BOT_CI_CHANNEL;
    if (channelName == null) {
      throw new Error("BOSH_BOT_CI_CHANNEL must be set.");
    }
    var boshEnv = process.env.BOSH_BOT_CI_DIRECTOR_ADDRESS;
    if (boshEnv == null) {
      throw new Error("BOSH_BOT_CI_DIRECTOR_ADDRESS must be set.");
    }
    var boshUser = process.env.BOSH_BOT_CI_DIRECTOR_USER;
    if (boshUser == null) {
      throw new Error("BOSH_BOT_CI_DIRECTOR_USER must be set.");
    }
    var boshPassword = process.env.BOSH_BOT_CI_DIRECTOR_PASSWORD;
    if (boshPassword == null) {
      throw new Error("BOSH_BOT_CI_DIRECTOR_PASSWORD must be set.");
    }
    var boshStemcellID = process.env.BOSH_BOT_CI_STEMCELL_ID;
    if (boshStemcellID == null) {
      throw new Error("BOSH_BOT_CI_STEMCELL_ID must be set.");
    }

    var botConfig = {
      slack: {
        token: serverToken,
        authorized_usernames: [clientBotName],
        authorized_channels: [channelName],
      },
      bosh: {
        env: boshEnv,
        user: boshUser,
        password: boshPassword,
        releases: [
          {
            name: 'dummy',
            boshio_id: 'github.com/pivotal-cf-experimental/dummy-boshrelease'
          }
        ],
        stemcells: [
          {
            boshio_id: boshStemcellID,
          }
        ],
        deployments: [
          {
            name: deploymentName,
            manifest_path: 'bosh-bot/integration/assets/dummy-manifest.yml',
            assets: ['bosh-bot'],
            vars: {
              deployment_name: deploymentName,
            },
            vars_store: {
              endpoint: process.env.BOSH_BOT_S3_ENDPOINT,
              access_key: process.env.BOSH_BOT_S3_ACCESS_KEY,
              secret_key: process.env.BOSH_BOT_S3_SECRET_KEY,
              bucket: process.env.BOSH_BOT_S3_BUCKET,
              key: `integration-test/${deploymentName}.yml`,
            }
          }
        ],
        assets: [
          {
            name: 'bosh-bot',
            type: 'git',
            uri: 'ssh://git@github.com/ljfranklin/bosh-bot.git',
            deploy_key: process.env.BOSH_BOT_CI_DEPLOY_KEY,
          }
        ],
      }
    };
    // TODO: random file name
    configPath = '/tmp/bosh-bot-config.yml';
    var err = fs.writeFileSync(configPath, JSON.stringify(botConfig));
    if (err) {
      throw err;
    }

    slackClient = new RtmClient(clientToken);

    slackClient.on(CLIENT_EVENTS.RTM.AUTHENTICATED, function (info) {
      channelID = info.channels.find(function(channel) {
        return (channel.name == channelName);
      }).id;
      serverBotID = info.users.find(function(user) {
        return (user.name == serverBotName);
      }).id;
      clientBotID = info.self.id;

      slackClient.on(CLIENT_EVENTS.RTM.RTM_CONNECTION_OPENED, function() {
        var botExecutable = path.join(__dirname, '..', 'bot.js');
        botProcess = spawn('node', [botExecutable], { env: { BOSH_BOT_CONFIG: configPath, PATH: process.env.PATH } });
        botProcess.stderr.on('data', function(data) {
          console.log(data.toString());
        });
        botProcess.stdout.on('data', function(data) {
          console.log(data.toString());
          if (data.toString().includes('Ready for connections')) {
            done();
          }
        });
      });
    });

    slackClient.start();
    // create config with dummy release
  });

  afterEach(function() {
    // delete the dummy release from director
    // delete the dummy deployment from director
    botProcess.kill();
    fs.unlinkSync(configPath);
  });

  it('performs a deployment', function(done) {
    this.timeout(30000);

    slackClient.sendMessage(`<@${serverBotID}|${serverBotName}> deploy ${deploymentName}!`, channelID, function(err) {
      if (err) {
        throw err;
      }
    });

    slackClient.on(RTM_EVENTS.MESSAGE, function(message) {
      if (message.user == clientBotID) {
        return;
      }
      console.log(`Received message: ${message.text}`);

      if (message.text.includes('takeoff')) {
        slackClient.sendMessage(`<@${serverBotID}|${serverBotName}> takeoff!`, channelID, function(err) {
          if (err) {
            throw err;
          }

          // verify success response
          done();
        });
      }
    });

    // verify deployment actually exists
  });
});
