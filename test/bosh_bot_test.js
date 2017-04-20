var expect = require('chai').expect;
var td = require('testdouble');
var proxyquire = require('proxyquire');
var lolex = require("lolex");
var Readable = require('stream').Readable;
var ChildProcess = require('child_process').ChildProcess;
var BoshRunner = require('../src/bosh_runner');
var BoshioClient = require('../src/boshio_client');
var TestBot = require('../src/test_bot');
var Assets = require('../src/assets');
var UpgradeChecker = require('../src/upgrade/checker');
var UpgradeApplier = require('../src/upgrade/applier');
var UpgradeConvo = require('../src/upgrade/convo');
var DeployConvo = require('../src/deploy/convo');

describe('BoshBot', function() {
  var testController;
  var alice;
  var fakeRunner;
  var fakeBoshio;
  var fakeUpgradeChecker;
  var fakeUpgradeApplier;
  var fakeUpgradeConvo;
  var fakeDeployConvo;
  var fakeAssets;
  var boshConfig;
  var fakeClock;
  var fakeApi;

  beforeEach(function() {
    fakeClock = lolex.install();

    testController = TestBot();
    testController.spawn();

    testController.addEventTrigger('direct_mention', function(message) {
      if (message.text.includes('@bot')) {
        message.text = message.text
          .replace('@bot', '')
          .replace(/^\s+/, '')
          .replace(/^\:\s+/, '')
          .replace(/^\s+/, '');
        return message;
      }
      return null;
    });
    testController.addEventTrigger('ambient', function(message) {
      return message;
    });

    alice = testController.createUser({
      user: 'alice'
    });

    fakeRunner = td.object(BoshRunner());
    fakeBoshio = td.object(BoshioClient());
    fakeAssets = td.object(Assets());
    fakeUpgradeChecker = td.object(UpgradeChecker({}));
    fakeUpgradeApplier = td.object(UpgradeApplier({}));
    fakeUpgradeConvo = td.object(UpgradeConvo({}));
    fakeDeployConvo = td.object(DeployConvo({}));

    boshConfig = {
      env: 'https://my-bosh.com',
      user: 'admin',
      password: 'fake-password',
      assets: [
        {
          name: 'concourse',
          type: 'git',
          uri: 'https://fake-repo.git'
        },
        {
          name: 'unused',
          type: 'git',
          uri: 'https://fake-unused.git'
        }
      ],
      deployments: [
        {
          name: 'concourse',
          manifest_path: 'fake-manifest.yml',
          assets: ['concourse']
        },
      ],
      authorizedUserIDs: [
        'alice',
      ],
    };
  });

  afterEach(function(){
    fakeClock.uninstall();
    td.reset();
  });

  function spawnBot() {
    var BoshBot = proxyquire('../src/bosh_bot', {
      './bosh_runner': function(runnerConfig) {
        expect(runnerConfig.env).to.eql('https://my-bosh.com')
        expect(runnerConfig.user).to.eql('admin');
        expect(runnerConfig.password).to.eql('fake-password');
        return fakeRunner;
      },
      './boshio_client': function() {
        return fakeBoshio;
      },
      './assets': function() {
        return fakeAssets;
      },
      './upgrade/checker': function() {
        return fakeUpgradeChecker;
      },
      './upgrade/applier': function() {
        return fakeUpgradeApplier;
      },
      './upgrade/convo': function() {
        return fakeUpgradeConvo;
      },
      './deploy/convo': function() {
        return fakeDeployConvo;
      },
    });

    td.when(fakeAssets.fetchAll(boshConfig.assets))
      .thenCallback(null);

    var bot = BoshBot(boshConfig);
    bot.setup(testController, 'general', function() {})
  }

  describe('greetings', function(){
    it('says hi back', function() {
      spawnBot();

      alice.say('@bot hello');
      expect(testController.response()).to.eql('<@alice> Hello yourself.');
    });

    it('replies with pong', function() {
      spawnBot();

      alice.say('@bot ping');
      expect(testController.response()).to.eql('<@alice> pong');
    });

    it('responses on unsupported input', function() {
      spawnBot();

      alice.say('@bot foo');
      expect(testController.response()).to.eql('<@alice> Sorry, didn\'t catch that...');
    });

    it('tells an unknown user that they do not have permission', function() {
      spawnBot();

      var becky = testController.createUser({
        user: 'becky'
      });

      becky.say('@bot ping');
      expect(testController.response()).to.include('ticket');
    });

    it('does not respond if not in an authorized channel', function() {
      boshConfig.authorizedChannelIDs = ['authorized-channel'];
      boshConfig.authorizedUserIDs = [
        'becky',
      ];

      spawnBot();

      var becky = testController.createUser({
        user: 'becky',
        channel: 'non-authorized-channel'
      });

      becky.say('@bot ping');
      expect(testController.response()).to.be.null;
    });
  });

  describe('env', function(){
    it('responds with the configured environment URL', function() {
      spawnBot();

      alice.say('@bot env');
      expect(testController.response()).to.eql('<@alice> Currently targeting *https://my-bosh.com*.');
    });
  });

  it('adds the deploy convos', function() {
    spawnBot();

    td.verify(fakeDeployConvo.addListeners(testController));
  });

  it('adds the upgrade convos', function() {
    spawnBot();

    td.verify(fakeUpgradeConvo.addListeners(testController));
  });
});
