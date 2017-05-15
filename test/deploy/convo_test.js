var expect = require('chai').expect
var td = require('testdouble')

var TestBot = require('../../src/test_bot')
var BoshRunner = require('../../src/bosh_runner')
var Assets = require('../../src/assets')
var DeployConvo = require('../../src/deploy/convo')
var Personality = require('../../src/personality')

describe('DeployConvo', function () {
  var testController
  var alice
  var convo
  var fakeAssets
  var fakeRunner

  var diffPrompt = `
  stemcells:
+ - alias: trusty
+   os: ubuntu-trusty
+   version: '3312'
- - alias: trusty
-   os: ubuntu-trusty
-   version: '3263.7'
`

  var boshVars = {
    fake_key: 'fake_value'
  }
  var boshVarFiles = {
    fake_var_file: 'fake_var_path'
  }
  var boshVarsFiles = {
    fake_vars_file: 'fake_vars_path'
  }
  var boshOpsFiles = {
    fake_ops_file: 'fake_ops_path'
  }
  var boshVarsStore = {
    type: 's3',
    bucket: 'fake-bucket',
    key: 'fake-key',
    accessKey: 'fake-access-key',
    secretKey: 'fake-secret-key'
  }

  beforeEach(function () {
    testController = TestBot()
    testController.spawn()

    testController.addEventTrigger('direct_mention', function (message) {
      if (message.text.includes('@bot')) {
        message.text = message.text
          .replace('@bot', '')
          .replace(/^\s+/, '')
          .replace(/^:\s+/, '')
          .replace(/^\s+/, '')
        return message
      }
      return null
    })
    testController.addEventTrigger('ambient', function (message) {
      return message
    })

    fakeRunner = td.object(BoshRunner())
    fakeAssets = td.object(Assets())

    alice = testController.createUser({
      user: 'alice'
    })

    var personality = Personality('captain_bucky')
    var err = personality.loadSync()
    expect(err).to.be.null

    convo = DeployConvo({
      personality: personality,
      runner: fakeRunner,
      assetsFetcher: fakeAssets,
      deployments: [{
        name: 'concourse',
        manifest_path: 'fake-manifest.yml',
        assets: ['concourse'],
        vars: boshVars,
        var_files: boshVarFiles,
        vars_files: boshVarsFiles,
        ops_files: boshOpsFiles,
        vars_store: boshVarsStore
      }],
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
      ]
    })

    convo.addListeners(testController)

    td.when(fakeAssets.fetchAll(td.matchers.anything()))
      .thenCallback(null)
  })

  afterEach(function () {
    td.reset()
  })

  it('starts the deployment', function (done) {
    var expectedDeployOpts = {
      name: 'concourse',
      manifest_path: 'fake-manifest.yml',
      vars: boshVars,
      var_files: boshVarFiles,
      vars_files: boshVarsFiles,
      ops_files: boshOpsFiles,
      vars_store: boshVarsStore
    }
    td.when(fakeRunner.showDiff(expectedDeployOpts))
      .thenCallback(null, diffPrompt, '')

    alice.say('@bot deploy concourse')

    var assetResponse = testController.response()
    expect(assetResponse, 'no response found').to.not.be.null

    var diffResponse = testController.response()
    expect(diffResponse, 'no response found').to.not.be.null
    expect(diffResponse).to.contain('@alice')
    expect(diffResponse).to.contain('stemcells')
    expect(diffResponse).to.contain('takeoff')

    td.when(fakeRunner.deploy(expectedDeployOpts, td.matchers.isA(Function), td.matchers.isA(Function)))
      .thenDo(function (_, startCb, endCb) {
        var cancelCb = td.function('.cancel')
        startCb('777', cancelCb)

        var deployResponse = testController.response()
        expect(deployResponse, 'no response found').to.not.be.null
        expect(deployResponse).to.contain('@alice')
        expect(deployResponse).to.contain('bosh task 777')

        endCb(null)
        var deployEndResponse = testController.response()
        expect(deployEndResponse, 'no response found').to.not.be.null
        expect(deployEndResponse).to.contain('@alice')
        expect(deployEndResponse).to.contain('successful')

        td.verify(cancelCb(), {times: 0})

        done()
      })
    alice.say('@bot takeoff!')
  })

  it('cancels the deployment if user enters unsupported response', function () {
    var expectedDeployOpts = {
      name: 'concourse',
      manifest_path: 'fake-manifest.yml',
      vars: boshVars,
      var_files: boshVarFiles,
      vars_files: boshVarsFiles,
      ops_files: boshOpsFiles,
      vars_store: boshVarsStore
    }
    td.when(fakeRunner.showDiff(expectedDeployOpts))
      .thenCallback(null, diffPrompt, '')

    alice.say('@bot deploy concourse')

    var assetResponse = testController.response()
    expect(assetResponse, 'no response found').to.not.be.null
    var diffResponse = testController.response()
    expect(diffResponse, 'no response found').to.not.be.null

    alice.say('@bot foo')

    expect(testController.response()).to.eql("<@alice> I guess you don't want to *'takeoff'* after all...")

    alice.say('@bot takeoff')

    expect(testController.response()).to.eql("<@alice> Let me know our destination with *'deploy DESTINATION'*.")
  })

  it('cancels the deployment if user enters unknown deployment name', function () {
    var expectedDeployOpts = {
      name: 'concourse',
      manifest_path: 'fake-manifest.yml',
      vars: boshVars,
      var_files: boshVarFiles,
      vars_files: boshVarsFiles,
      ops_files: boshOpsFiles,
      vars_store: boshVarsStore
    }
    td.when(fakeRunner.showDiff(expectedDeployOpts))
      .thenCallback(null, diffPrompt, '')

    alice.say('@bot deploy foo')

    var diffResponse = testController.response()
    expect(diffResponse, 'no response found').to.not.be.null
    expect(diffResponse).to.contain('alice')
    expect(diffResponse).to.contain('foo')
    expect(diffResponse).to.contain('concourse')
  })

  it('allows the user to cancel the deployment', function (done) {
    var expectedDeployOpts = {
      name: 'concourse',
      manifest_path: 'fake-manifest.yml',
      vars: boshVars,
      var_files: boshVarFiles,
      vars_files: boshVarsFiles,
      ops_files: boshOpsFiles,
      vars_store: boshVarsStore
    }
    td.when(fakeRunner.showDiff(expectedDeployOpts))
      .thenCallback(null, diffPrompt, '')

    alice.say('@bot deploy concourse')

    var assetResponse = testController.response()
    expect(assetResponse, 'no response found').to.not.be.null
    var diffResponse = testController.response()
    expect(diffResponse, 'no response found').to.not.be.null

    td.when(fakeRunner.deploy(expectedDeployOpts, td.matchers.isA(Function), td.matchers.isA(Function)))
      .thenDo(function (_, startCb, endCb) {
        var cancelCb = td.function('.cancel')
        startCb('777', cancelCb)
        var deployResponse = testController.response()
        expect(deployResponse, 'no response found').to.not.be.null
        expect(deployResponse).to.contain('@alice')
        expect(deployResponse).to.contain('mayday')

        alice.say('@bot mayday!')
        var cancelResponse = testController.response()
        expect(cancelResponse, 'no response found').to.not.be.null
        expect(cancelResponse).to.contain('@alice')
        expect(cancelResponse).to.contain('Hold on')

        endCb(new Error('Deploy failed with exit code 1'))
        var deployEndResponse = testController.response()
        expect(deployEndResponse, 'no response found').to.not.be.null
        expect(deployEndResponse).to.contain('@alice')
        expect(deployEndResponse).to.contain('landing')
        expect(deployEndResponse).to.contain('bosh task 777')

        td.verify(cancelCb(), {times: 1})

        done()
      })
    alice.say('@bot takeoff!')
  })

  it('prints all output if deploy fails before task starts', function (done) {
    var expectedDeployOpts = {
      name: 'concourse',
      manifest_path: 'fake-manifest.yml',
      vars: boshVars,
      var_files: boshVarFiles,
      vars_files: boshVarsFiles,
      ops_files: boshOpsFiles,
      vars_store: boshVarsStore
    }
    td.when(fakeRunner.showDiff(expectedDeployOpts))
      .thenCallback(null, diffPrompt, '')

    alice.say('@bot deploy concourse')

    var diffResponse = testController.response()
    expect(diffResponse, 'no response found').to.not.be.null

    td.when(fakeRunner.deploy(expectedDeployOpts, td.matchers.isA(Function), td.matchers.isA(Function)))
      .thenDo(function (_, startCb, endCb) {
        var errMessage = `
Using environment 'bosh.lylefranklin.com' as user 'admin'

Using deployment 'fake-name'

Expected manifest to specify deployment name 'fake-name' but was 'concourse'

Exit code 1`
        endCb(new Error(errMessage))

        var deployEndResponse = testController.responses().pop()
        expect(deployEndResponse, 'no response found').to.not.be.null
        expect(deployEndResponse).to.contain('@alice')
        expect(deployEndResponse).to.contain(errMessage)

        done()
      })
    alice.say('@bot takeoff!')
  })

  it('pulls a public git repo on `deploy`', function () {
    var expectedDeployOpts = {
      name: 'concourse',
      manifest_path: 'fake-manifest.yml',
      vars: boshVars,
      var_files: boshVarFiles
    }
    // TODO: figure out how to verify these invocations
    td.when(fakeAssets.fetchAll({ concourse: convo.assets.concourse }))
      .thenCallback(null)
    td.when(fakeRunner.showDiff(expectedDeployOpts))
      .thenCallback(null, diffPrompt, '')

    alice.say('@bot deploy concourse')

    var responses = testController.responses()
    expect(responses[0], 'no response found').to.not.be.null
    expect(responses[0]).to.contain('assets')
  })

  it('says an error if fetching asset fails prior to deploy', function () {
    var expectedAssets = convo.assets.filter(function (a) {
      return a.name === 'concourse'
    })
    td.when(fakeAssets.fetchAll(expectedAssets))
      .thenCallback(new Error('my-fake-error'))

    alice.say('@bot deploy concourse')

    var resp = testController.responses().pop()
    expect(resp).to.contain('my-fake-error')
  })
})
