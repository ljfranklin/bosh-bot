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

describe('BoshBot', function() {
  var testController;
  var alice;
  var fakeRunner;
  var fakeBoshio;
  var fakeAssets;
  var boshConfig;
  var fakeClock;

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
      fake_file: 'fake_path'
    };

    beforeEach(function() {
      boshConfig.deployments[0].vars = bosh_vars;
      boshConfig.deployments[0].var_files = bosh_var_files;

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
          endCb(new Error(errMessage));

          var deployEndResponse = testController.responses().pop();
          expect(deployEndResponse, 'no response found').to.not.be.null;
          expect(deployEndResponse).to.contain('@alice');
          expect(deployEndResponse).to.contain(errMessage);

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

      var boshioVersions = {
        'github.com/concourse/concourse': {
          version: '2.5.0',
          url: 'https://bosh.io/d/github.com/concourse/concourse?v=2.5.0',
        },
        'github.com/cloudfoundry/garden-runc-release': {
          version: '1.0.4',
          url: 'https://bosh.io/d/github.com/cloudfoundry/garden-runc-release?v=1.0.4',
        },
      }
      td.when(fakeBoshio.getLatestReleaseVersions(Object.keys(boshioVersions)))
        .thenCallback(null, boshioVersions);

      var directorVersions = {
        'concourse': {
          version: '2.4.0',
        },
        'garden-runc': {
          version: '1.0.4',
        },
      }
      td.when(fakeRunner.getLatestReleaseVersions())
        .thenCallback(null, directorVersions);

      td.when(fakeRunner.uploadReleases(['https://bosh.io/d/github.com/concourse/concourse?v=2.5.0']))
        .thenCallback(null);
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

      var boshioVersions = {
        'github.com/concourse/concourse': {
          version: '2.5.0',
          url: 'https://bosh.io/d/github.com/concourse/concourse?v=2.5.0',
        },
      }
      td.when(fakeBoshio.getLatestReleaseVersions(td.matchers.contains('github.com/concourse/concourse')))
        .thenCallback(null, boshioVersions);

      var directorVersions = {
        concourse: {
          version: '2.5.0',
        },
      }
      td.when(fakeRunner.getLatestReleaseVersions())
        .thenCallback(null, directorVersions);

      fakeClock.tick('01:00:01');

      var resp = testController.response();
      expect(resp, 'response found').to.be.null;

      td.verify(fakeRunner.uploadReleases(), {times: 0, ignoreExtraArgs: true})
    });

    it('checks for new releases on `upgrade`', function() {
      boshConfig.releases = [
        {
          name: 'concourse',
          boshio_id: 'github.com/concourse/concourse',
        },
      ];
      spawnBot();

      var boshioVersions = {
        'github.com/concourse/concourse': {
          version: '2.5.0',
          url: 'https://bosh.io/d/github.com/concourse/concourse?v=2.5.0',
        },
      }
      td.when(fakeBoshio.getLatestReleaseVersions(td.matchers.contains('github.com/concourse/concourse')))
        .thenCallback(null, boshioVersions);

      var directorVersions = {
        concourse: {
          version: '2.4.0',
        },
      }
      td.when(fakeRunner.getLatestReleaseVersions())
        .thenCallback(null, directorVersions);

      td.when(fakeRunner.uploadReleases(['https://bosh.io/d/github.com/concourse/concourse?v=2.5.0']))
        .thenCallback(null);

      alice.say('@bot upgrade!');

      var responses = testController.responses();
      expect(responses.length).to.equal(2);
      expect(responses[0], 'no response found').to.not.be.null;
      expect(responses[0]).to.contain('alice');
      expect(responses[0]).to.contain('upgrades');

      expect(responses[1], 'no response found').to.not.be.null;
      expect(responses[1]).to.contain('alice');
      expect(responses[1]).to.contain('concourse');
      expect(responses[1]).to.contain('2.5.0');
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

      var boshioVersions = {
        'bosh-aws-xen-hvm-ubuntu-trusty-go_agent': {
          name: 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent',
          version: '3312.17',
          url: 'https://s3.amazonaws.com/bosh-aws-light-stemcells/light-bosh-stemcell-3312.17-aws-xen-hvm-ubuntu-trusty-go_agent.tgz',
        },
      }
      td.when(fakeBoshio.getLatestStemcellVersions(td.matchers.contains('bosh-aws-xen-hvm-ubuntu-trusty-go_agent')))
        .thenCallback(null, boshioVersions);

      var directorVersions = {
        'bosh-aws-xen-hvm-ubuntu-trusty-go_agent': {
          version: '3312.16',
        },
      }
      td.when(fakeRunner.getLatestStemcellVersions())
        .thenCallback(null, directorVersions);

      td.when(fakeRunner.uploadStemcells(['https://s3.amazonaws.com/bosh-aws-light-stemcells/light-bosh-stemcell-3312.17-aws-xen-hvm-ubuntu-trusty-go_agent.tgz']))
        .thenCallback(null);
      fakeClock.tick('01:01');

      var resp = testController.response();
      expect(resp, 'no response found').to.not.be.null;
      expect(resp).to.contain('bosh-aws-xen-hvm-ubuntu-trusty-go_agent');
      expect(resp).to.contain('3312.17');
    });

    it('does not upload stemcells if no newer versions exist', function() {
      boshConfig.stemcells = [
        {
          boshio_id: 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent',
        },
      ];
      boshConfig.releases = [];
      spawnBot();

      var boshioVersions = {
        'bosh-aws-xen-hvm-ubuntu-trusty-go_agent': {
          name: 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent',
          version: '3312.17',
          url: 'https://s3.amazonaws.com/bosh-aws-light-stemcells/light-bosh-stemcell-3312.17-aws-xen-hvm-ubuntu-trusty-go_agent.tgz',
        },
      }
      td.when(fakeBoshio.getLatestStemcellVersions(td.matchers.contains('bosh-aws-xen-hvm-ubuntu-trusty-go_agent')))
        .thenCallback(null, boshioVersions);

      var directorVersions = {
        'bosh-aws-xen-hvm-ubuntu-trusty-go_agent': {
          version: '3312.17',
        },
      }
      td.when(fakeRunner.getLatestStemcellVersions())
        .thenCallback(null, directorVersions);

      fakeClock.tick('01:00:01');

      var resp = testController.response();
      expect(resp, 'response found').to.be.null;

      td.verify(fakeRunner.uploadStemcells(), {times: 0, ignoreExtraArgs: true})
    });

    it('checks for new stemcells on `upgrade`', function() {
      boshConfig.stemcells = [
        {
          boshio_id: 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent',
        },
      ];
      boshConfig.releases = [];
      spawnBot();

      var boshioVersions = {
        'bosh-aws-xen-hvm-ubuntu-trusty-go_agent': {
          name: 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent',
          version: '3312.17',
          url: 'https://s3.amazonaws.com/bosh-aws-light-stemcells/light-bosh-stemcell-3312.17-aws-xen-hvm-ubuntu-trusty-go_agent.tgz',
        },
      }
      td.when(fakeBoshio.getLatestStemcellVersions(td.matchers.contains('bosh-aws-xen-hvm-ubuntu-trusty-go_agent')))
        .thenCallback(null, boshioVersions);

      var directorVersions = {
        'bosh-aws-xen-hvm-ubuntu-trusty-go_agent': {
          version: '3312.16',
        },
      }
      td.when(fakeRunner.getLatestStemcellVersions())
        .thenCallback(null, directorVersions);

      td.when(fakeRunner.uploadStemcells(['https://s3.amazonaws.com/bosh-aws-light-stemcells/light-bosh-stemcell-3312.17-aws-xen-hvm-ubuntu-trusty-go_agent.tgz']))
        .thenCallback(null);

      alice.say('@bot upgrade!');

      var responses = testController.responses();
      expect(responses.length).to.eql(2);
      expect(responses[0], 'no response found').to.not.be.null;
      expect(responses[0]).to.contain('alice');
      expect(responses[0]).to.contain('upgrades');

      expect(responses[1], 'no response found').to.not.be.null;
      expect(responses[1]).to.contain('alice');
      expect(responses[1]).to.contain('aws');
      expect(responses[1]).to.contain('3312.17');
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
