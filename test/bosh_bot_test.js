var expect = require('chai').expect;
var td = require('testdouble');
var proxyquire = require('proxyquire');
var Readable = require('stream').Readable;
var ChildProcess = require('child_process').ChildProcess;
var BoshRunner = require('../src/bosh_runner');
var TestBot = require('../src/test_bot');

describe('BoshBot', function() {
  var testController;
  var alice;
  var fakeRunner;
  var boshConfig;

  beforeEach(function() {
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

    boshConfig = {
      env: 'https://my-bosh.com',
      user: 'admin',
      password: 'fake-password',
    };
  });

  afterEach(function(){
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
    });

    var bot = BoshBot(boshConfig);
    bot.setup(testController)
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

    var vars_file_contents = `---
fake_key: fake_value
`;

    beforeEach(function() {
      boshConfig.deployments = {
        concourse: {
          manifest_path: 'fake-manifest.yml',
          vars_file_contents: vars_file_contents,
        },
      }
    });

    it('starts the deployment', function(done) {
      spawnBot();

      var expectedDeployOpts = {
        name: 'concourse',
        manifest_path: 'fake-manifest.yml',
        vars_file_contents: vars_file_contents,
      };
      td.when(fakeRunner.showDiff(expectedDeployOpts))
        .thenCallback(null, diffPrompt, '');

      alice.say('@bot deploy concourse');

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

    it('allows the user to cancel the deployment', function(done) {
      spawnBot();

      var expectedDeployOpts = {
        name: 'concourse',
        manifest_path: 'fake-manifest.yml',
        vars_file_contents: vars_file_contents,
      };
      td.when(fakeRunner.showDiff(expectedDeployOpts))
        .thenCallback(null, diffPrompt, '');

      alice.say('@bot deploy concourse');

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
        vars_file_contents: vars_file_contents,
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

          var deployEndResponse = testController.response();
          expect(deployEndResponse, 'no response found').to.not.be.null;
          expect(deployEndResponse).to.contain('@alice');
          expect(deployEndResponse).to.contain(errMessage);

          td.verify(fakeRunner.precheck());

          done();
        });
      alice.say('@bot takeoff!');
    });
  });
});
