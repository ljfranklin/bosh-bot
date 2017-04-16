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

describe('BoshBot', function() {
  var testController;
  var alice;
  var fakeRunner;
  var fakeBoshio;
  var fakeUpgradeChecker;
  var fakeUpgradeApplier;
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

  describe('deploy', function(){
    var diffPrompt = `
  stemcells:
+ - alias: trusty
+   os: ubuntu-trusty
+   version: '3312'
- - alias: trusty
-   os: ubuntu-trusty
-   version: '3263.7'
`;

    var bosh_vars = {
      fake_key: 'fake_value'
    };
    var bosh_var_files = {
      fake_var_file: 'fake_var_path'
    };
    var bosh_vars_files = {
      fake_vars_file: 'fake_vars_path'
    };
    var bosh_ops_files = {
      fake_ops_file: 'fake_ops_path'
    };
    var bosh_vars_store = {
      type: 's3',
      bucket: 'fake-bucket',
      key: 'fake-key',
      accessKey: 'fake-access-key',
      secretKey: 'fake-secret-key',
    };

    beforeEach(function() {
      boshConfig.deployments[0].vars = bosh_vars;
      boshConfig.deployments[0].var_files = bosh_var_files;
      boshConfig.deployments[0].vars_files = bosh_vars_files;
      boshConfig.deployments[0].ops_files = bosh_ops_files;
      boshConfig.deployments[0].vars_store = bosh_vars_store;

      td.when(fakeAssets.fetchAll(td.matchers.anything()))
        .thenCallback(null);
    });

    it('starts the deployment', function(done) {
      spawnBot();

      var expectedDeployOpts = {
        name: 'concourse',
        manifest_path: 'fake-manifest.yml',
        vars: bosh_vars,
        var_files: bosh_var_files,
        vars_files: bosh_vars_files,
        ops_files: bosh_ops_files,
        vars_store: bosh_vars_store,
      };
      td.when(fakeRunner.showDiff(expectedDeployOpts))
        .thenCallback(null, diffPrompt, '');

      alice.say('@bot deploy concourse');

      var assetResponse = testController.response();
      expect(assetResponse, 'no response found').to.not.be.null;

      var diffResponse = testController.response();
      expect(diffResponse, 'no response found').to.not.be.null;
      expect(diffResponse).to.contain('@alice');
      expect(diffResponse).to.contain('stemcells');
      expect(diffResponse).to.contain('takeoff');

      td.when(fakeRunner.deploy(expectedDeployOpts, td.matchers.isA(Function), td.matchers.isA(Function)))
        .thenDo(function(_, startCb, endCb) {
          var cancelCb = td.function('.cancel');
          startCb('777', cancelCb);

          var deployResponse = testController.response();
          expect(deployResponse, 'no response found').to.not.be.null;
          expect(deployResponse).to.contain('@alice');
          expect(deployResponse).to.contain('bosh task 777');

          endCb(null);
          var deployEndResponse = testController.response();
          expect(deployEndResponse, 'no response found').to.not.be.null;
          expect(deployEndResponse).to.contain('@alice');
          expect(deployEndResponse).to.contain('successful');

          td.verify(fakeRunner.precheck());
          td.verify(cancelCb(), {times: 0});

          done();
        });
      alice.say('@bot takeoff!');
    });

    it('cancels the deployment if user enters unsupported response', function() {
      spawnBot();

      var expectedDeployOpts = {
        name: 'concourse',
        manifest_path: 'fake-manifest.yml',
        vars: bosh_vars,
        var_files: bosh_var_files,
        vars_files: bosh_vars_files,
        ops_files: bosh_ops_files,
        vars_store: bosh_vars_store,
      };
      td.when(fakeRunner.showDiff(expectedDeployOpts))
        .thenCallback(null, diffPrompt, '');

      alice.say('@bot deploy concourse');

      var assetResponse = testController.response();
      expect(assetResponse, 'no response found').to.not.be.null;
      var diffResponse = testController.response();
      expect(diffResponse, 'no response found').to.not.be.null;

      alice.say('@bot foo');

      expect(testController.response()).to.eql("<@alice> I guess you don\'t want to *'takeoff'* after all...");

      alice.say('@bot takeoff');

      expect(testController.response()).to.eql("<@alice> Let me know our destination with *'deploy DESTINATION'*.");
    });

    it('cancels the deployment if user enters unknown deployment name', function() {
      spawnBot();

      var expectedDeployOpts = {
        name: 'concourse',
        manifest_path: 'fake-manifest.yml',
        vars: bosh_vars,
        var_files: bosh_var_files,
        vars_files: bosh_vars_files,
        ops_files: bosh_ops_files,
        vars_store: bosh_vars_store,
      };
      td.when(fakeRunner.showDiff(expectedDeployOpts))
        .thenCallback(null, diffPrompt, '');

      alice.say('@bot deploy foo');

      var diffResponse = testController.response();
      expect(diffResponse, 'no response found').to.not.be.null;
      expect(diffResponse).to.contain('alice');
      expect(diffResponse).to.contain('foo');
      expect(diffResponse).to.contain('concourse');
    });

    it('allows the user to cancel the deployment', function(done) {
      spawnBot();

      var expectedDeployOpts = {
        name: 'concourse',
        manifest_path: 'fake-manifest.yml',
        vars: bosh_vars,
        var_files: bosh_var_files,
        vars_files: bosh_vars_files,
        ops_files: bosh_ops_files,
        vars_store: bosh_vars_store,
      };
      td.when(fakeRunner.showDiff(expectedDeployOpts))
        .thenCallback(null, diffPrompt, '');

      alice.say('@bot deploy concourse');

      var assetResponse = testController.response();
      expect(assetResponse, 'no response found').to.not.be.null;
      var diffResponse = testController.response();
      expect(diffResponse, 'no response found').to.not.be.null;

      td.when(fakeRunner.deploy(expectedDeployOpts, td.matchers.isA(Function), td.matchers.isA(Function)))
        .thenDo(function(_, startCb, endCb) {
          var cancelCb = td.function('.cancel');
          startCb('777', cancelCb);
          var deployResponse = testController.response();
          expect(deployResponse, 'no response found').to.not.be.null;
          expect(deployResponse).to.contain('@alice');
          expect(deployResponse).to.contain('mayday');

          alice.say('@bot mayday!');
          var cancelResponse = testController.response();
          expect(cancelResponse, 'no response found').to.not.be.null;
          expect(cancelResponse).to.contain('@alice');
          expect(cancelResponse).to.contain('Hold on');

          endCb(new Error('Deploy failed with exit code 1'));
          var deployEndResponse = testController.response();
          expect(deployEndResponse, 'no response found').to.not.be.null;
          expect(deployEndResponse).to.contain('@alice');
          expect(deployEndResponse).to.contain('landing');
          expect(deployEndResponse).to.contain('bosh task 777');

          td.verify(fakeRunner.precheck());
          td.verify(cancelCb(), {times: 1});

          done();
        });
      alice.say('@bot takeoff!');
    });

    it('prints all output if deploy fails before task starts', function(done) {
      spawnBot();

      var expectedDeployOpts = {
        name: 'concourse',
        manifest_path: 'fake-manifest.yml',
        vars: bosh_vars,
        var_files: bosh_var_files,
        vars_files: bosh_vars_files,
        ops_files: bosh_ops_files,
        vars_store: bosh_vars_store,
      };
      td.when(fakeRunner.showDiff(expectedDeployOpts))
        .thenCallback(null, diffPrompt, '');

      alice.say('@bot deploy concourse');

      var diffResponse = testController.response();
      expect(diffResponse, 'no response found').to.not.be.null;

      td.when(fakeRunner.deploy(expectedDeployOpts, td.matchers.isA(Function), td.matchers.isA(Function)))
        .thenDo(function(_, startCb, endCb) {
          var errMessage = `
Using environment 'bosh.lylefranklin.com' as user 'admin'

Using deployment 'fake-name'

Expected manifest to specify deployment name 'fake-name' but was 'concourse'

Exit code 1`;
          endCb(new Error(errMessage), false);

          var deployEndResponse = testController.responses().pop();
          expect(deployEndResponse, 'no response found').to.not.be.null;
          expect(deployEndResponse).to.contain('@alice');
          expect(deployEndResponse).to.contain(errMessage);

          td.verify(fakeRunner.precheck());

          done();
        });
      alice.say('@bot takeoff!');
    });

    it('does not prints the deploy error if redact is true', function(done) {
      spawnBot();

      var expectedDeployOpts = {
        name: 'concourse',
        manifest_path: 'fake-manifest.yml',
        vars: bosh_vars,
        var_files: bosh_var_files,
        vars_files: bosh_vars_files,
        ops_files: bosh_ops_files,
        vars_store: bosh_vars_store,
      };
      td.when(fakeRunner.showDiff(expectedDeployOpts))
        .thenCallback(null, diffPrompt, '');

      alice.say('@bot deploy concourse');

      var diffResponse = testController.response();
      expect(diffResponse, 'no response found').to.not.be.null;

      td.when(fakeRunner.deploy(expectedDeployOpts, td.matchers.isA(Function), td.matchers.isA(Function)))
        .thenDo(function(_, startCb, endCb) {
          var errMessage = `
Using environment 'bosh.lylefranklin.com' as user 'admin'

Using deployment 'fake-name'

Expected manifest to specify deployment name 'fake-name' but was 'concourse'

Exit code 1`;
          endCb(new Error(errMessage), true);

          var deployEndResponse = testController.responses().pop();
          expect(deployEndResponse, 'no response found').to.not.be.null;
          expect(deployEndResponse).to.contain('@alice');
          expect(deployEndResponse).to.not.contain(errMessage);

          td.verify(fakeRunner.precheck());

          done();
        });
      alice.say('@bot takeoff!');
    });

    it('uploads new releases to the director on a timer', function() {
      boshConfig.releases = [
        {
          name: 'concourse',
          boshio_id: 'github.com/concourse/concourse',
        },
        {
          name: 'garden-runc',
          boshio_id: 'github.com/cloudfoundry/garden-runc-release',
        },
      ];
      spawnBot();

      fakeClock.tick('59:00');
      expect(testController.response()).to.be.nil;

      var newReleases = [
        {
          name: 'concourse',
          version: '2.5.0',
          url: 'https://bosh.io/d/github.com/concourse/concourse?v=2.5.0',
          displayName: 'concourse 2.5.0',
        }
      ];
      td.when(fakeUpgradeChecker.upgradeableReleases())
        .thenCallback(null, newReleases);
      td.when(fakeUpgradeChecker.upgradeableStemcells())
        .thenCallback(null, []);

      td.when(fakeUpgradeApplier.upgradeReleases(newReleases))
        .thenCallback(null, newReleases);
      fakeClock.tick('01:01');

      var resp = testController.response();
      expect(resp, 'no response found').to.not.be.null;
      expect(resp).to.contain('concourse');
      expect(resp).to.contain('2.5.0');
      expect(resp).to.not.contain('garden-runc');
    });

    it('does not upload releases if no newer versions exist', function() {
      boshConfig.releases = [
        {
          name: 'concourse',
          boshio_id: 'github.com/concourse/concourse',
        },
      ];
      spawnBot();

      td.when(fakeUpgradeChecker.upgradeableReleases())
        .thenCallback(null, []);
      td.when(fakeUpgradeChecker.upgradeableStemcells())
        .thenCallback(null, []);

      fakeClock.tick('01:00:01');

      var resp = testController.response();
      expect(resp, 'response found').to.be.null;

      td.verify(fakeUpgradeApplier.upgradeReleases(), {times: 0, ignoreExtraArgs: true})
    });

    it('checks for new releases on `upgrade`', function() {
      boshConfig.releases = [
        {
          name: 'concourse',
          boshio_id: 'github.com/concourse/concourse',
        },
      ];
      spawnBot();

      var newReleases = [
        {
          name: 'concourse',
          version: '2.5.0',
          url: 'https://bosh.io/d/github.com/concourse/concourse?v=2.5.0',
          displayName: 'concourse 2.5.0',
        }
      ];
      td.when(fakeUpgradeChecker.upgradeableReleases())
        .thenCallback(null, newReleases);
      td.when(fakeUpgradeChecker.upgradeableStemcells())
        .thenCallback(null, []);

      td.when(fakeUpgradeApplier.upgradeReleases(newReleases))
        .thenCallback(null, newReleases);

      alice.say('@bot upgrade!');

      var responses = testController.responses();
      expect(responses.length).to.equal(3);
      expect(responses[0], 'no response found').to.not.be.null;
      expect(responses[0]).to.contain('alice');
      expect(responses[0]).to.contain('upgrades');

      expect(responses[1], 'no response found').to.not.be.null;
      expect(responses[1]).to.contain('alice');
      expect(responses[1]).to.contain('concourse');
      expect(responses[1]).to.contain('2.5.0');

      expect(responses[2], 'no response found').to.not.be.null;
      expect(responses[2]).to.contain('alice');
      expect(responses[2]).to.contain('upgraded');
    });

    it('uploads new stemcells to the director on a timer', function() {
      boshConfig.stemcells = [
        {
          boshio_id: 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent',
        },
      ];
      boshConfig.releases = [];
      spawnBot();

      fakeClock.tick('59:00');
      expect(testController.response()).to.be.nil;

      var newStemcells = [
        {
          name: 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent',
          version: '3312.17',
          url: 'https://s3.amazonaws.com/bosh-aws-light-stemcells/light-bosh-stemcell-3312.17-aws-xen-hvm-ubuntu-trusty-go_agent.tgz',
          displayName: 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent 3312.17',
        }
      ];
      td.when(fakeUpgradeChecker.upgradeableReleases())
        .thenCallback(null, []);
      td.when(fakeUpgradeChecker.upgradeableStemcells())
        .thenCallback(null, newStemcells);

      td.when(fakeUpgradeApplier.upgradeStemcells(newStemcells))
        .thenCallback(null, newStemcells);
      fakeClock.tick('01:01');

      var resp = testController.response();
      expect(resp, 'no response found').to.not.be.null;
      expect(resp).to.contain('bosh-aws-xen-hvm-ubuntu-trusty-go_agent');
      expect(resp).to.contain('3312.17');
    });

    it('checks for new stemcells on `upgrade`', function() {
      boshConfig.stemcells = [
        {
          boshio_id: 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent',
        },
      ];
      boshConfig.releases = [];
      spawnBot();

      var newStemcells = [
        {
          name: 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent',
          version: '3312.17',
          url: 'https://s3.amazonaws.com/bosh-aws-light-stemcells/light-bosh-stemcell-3312.17-aws-xen-hvm-ubuntu-trusty-go_agent.tgz',
          displayName: 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent 3312.17',
        }
      ];
      td.when(fakeUpgradeChecker.upgradeableReleases())
        .thenCallback(null, []);
      td.when(fakeUpgradeChecker.upgradeableStemcells())
        .thenCallback(null, newStemcells);

      td.when(fakeUpgradeApplier.upgradeStemcells(newStemcells))
        .thenCallback(null, newStemcells);

      alice.say('@bot upgrade!');

      var responses = testController.responses();
      expect(responses.length).to.eql(3);
      expect(responses[0], 'no response found').to.not.be.null;
      expect(responses[0]).to.contain('alice');
      expect(responses[0]).to.contain('upgrades');

      expect(responses[1], 'no response found').to.not.be.null;
      expect(responses[1]).to.contain('alice');
      expect(responses[1]).to.contain('aws');
      expect(responses[1]).to.contain('3312.17');

      expect(responses[2], 'no response found').to.not.be.null;
      expect(responses[2]).to.contain('alice');
      expect(responses[2]).to.contain('upgraded');
    });

    it('pulls a public git repo on `deploy`', function() {
      spawnBot();

      var expectedDeployOpts = {
        name: 'concourse',
        manifest_path: 'fake-manifest.yml',
        vars: bosh_vars,
        var_files: bosh_var_files,
      };
      // TODO: figure out how to verify these invocations
      td.when(fakeAssets.fetchAll({ concourse: boshConfig.assets.concourse }))
        .thenCallback(null);
      td.when(fakeRunner.showDiff(expectedDeployOpts))
        .thenCallback(null, diffPrompt, '');

      alice.say('@bot deploy concourse');

      var responses = testController.responses();
      expect(responses[0], 'no response found').to.not.be.null;
      expect(responses[0]).to.contain('assets');
    });

    it('says an error if fetching asset fails prior to deploy', function() {
      spawnBot();

      var expectedAssets = boshConfig.assets.filter(function(a) {
        return a.name == 'concourse';
      });
      td.when(fakeAssets.fetchAll(expectedAssets))
        .thenCallback(new Error('my-fake-error'));

      alice.say('@bot deploy concourse');

      var resp = testController.responses().pop();
      expect(resp).to.contain('my-fake-error');
    });
  });
});
