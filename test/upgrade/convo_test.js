var expect = require('chai').expect
var td = require('testdouble')
var lolex = require('lolex')

var TestBot = require('../../src/test_bot')
var UpgradeApplier = require('../../src/upgrade/applier')
var UpgradeChecker = require('../../src/upgrade/checker')
var UpgradeConvo = require('../../src/upgrade/convo')

describe('UpgradeConvo', function () {
  var fakeUpgradeChecker
  var fakeUpgradeApplier
  var fakeClock
  var testController
  var alice
  var convo

  beforeEach(function () {
    fakeClock = lolex.install()

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

    alice = testController.createUser({
      user: 'alice'
    })

    fakeUpgradeChecker = td.object(UpgradeChecker({}))
    fakeUpgradeApplier = td.object(UpgradeApplier({}))

    convo = UpgradeConvo({
      checker: fakeUpgradeChecker,
      applier: fakeUpgradeApplier,
      interval: 30 * 60 * 1000,
      defaultChannel: 'general'
    })

    convo.addListeners(testController)
  })

  afterEach(function () {
    fakeClock.uninstall()
    td.reset()
  })

  it('uploads new releases to the director on a timer', function () {
    fakeClock.tick('29:00')
    expect(testController.response()).to.be.nil

    var newReleases = [
      {
        name: 'concourse',
        version: '2.5.0',
        url: 'https://bosh.io/d/github.com/concourse/concourse?v=2.5.0',
        displayName: 'concourse 2.5.0'
      }
    ]
    td.when(fakeUpgradeChecker.upgradeableReleases())
      .thenCallback(null, newReleases)
    td.when(fakeUpgradeChecker.upgradeableStemcells())
      .thenCallback(null, [])

    td.when(fakeUpgradeApplier.upgradeReleases(newReleases))
      .thenCallback(null, newReleases)
    fakeClock.tick('01:01')

    var resp = testController.response()
    expect(resp, 'no response found').to.not.be.null
    expect(resp).to.contain('concourse')
    expect(resp).to.contain('2.5.0')
    expect(resp).to.not.contain('garden-runc')
  })

  it('uploads new stemcells to the director on a timer', function () {
    fakeClock.tick('29:00')
    expect(testController.response()).to.be.nil

    var newStemcells = [
      {
        name: 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent',
        version: '3312.17',
        url: 'https://s3.amazonaws.com/bosh-aws-light-stemcells/light-bosh-stemcell-3312.17-aws-xen-hvm-ubuntu-trusty-go_agent.tgz',
        displayName: 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent 3312.17'
      }
    ]
    td.when(fakeUpgradeChecker.upgradeableReleases())
      .thenCallback(null, [])
    td.when(fakeUpgradeChecker.upgradeableStemcells())
      .thenCallback(null, newStemcells)

    td.when(fakeUpgradeApplier.upgradeStemcells(newStemcells))
      .thenCallback(null, newStemcells)
    fakeClock.tick('01:01')

    var resp = testController.response()
    expect(resp, 'no response found').to.not.be.null
    expect(resp).to.contain('bosh-aws-xen-hvm-ubuntu-trusty-go_agent')
    expect(resp).to.contain('3312.17')
  })

  it('checks for new releases on `upgrade`', function () {
    var newReleases = [
      {
        name: 'concourse',
        version: '2.5.0',
        url: 'https://bosh.io/d/github.com/concourse/concourse?v=2.5.0',
        displayName: 'concourse 2.5.0'
      }
    ]
    td.when(fakeUpgradeChecker.upgradeableReleases())
      .thenCallback(null, newReleases)
    td.when(fakeUpgradeChecker.upgradeableStemcells())
      .thenCallback(null, [])

    td.when(fakeUpgradeApplier.upgradeReleases(newReleases))
      .thenCallback(null, newReleases)

    alice.say('@bot upgrade!')

    var responses = testController.responses()
    expect(responses.length).to.equal(3)
    expect(responses[0], 'no response found').to.not.be.null
    expect(responses[0]).to.contain('alice')
    expect(responses[0]).to.contain('upgrades')

    expect(responses[1], 'no response found').to.not.be.null
    expect(responses[1]).to.contain('alice')
    expect(responses[1]).to.contain('concourse')
    expect(responses[1]).to.contain('2.5.0')

    expect(responses[2], 'no response found').to.not.be.null
    expect(responses[2]).to.contain('alice')
    expect(responses[2]).to.contain('upgraded')
  })

  it('checks for new stemcells on `upgrade`', function () {
    var newStemcells = [
      {
        name: 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent',
        version: '3312.17',
        url: 'https://s3.amazonaws.com/bosh-aws-light-stemcells/light-bosh-stemcell-3312.17-aws-xen-hvm-ubuntu-trusty-go_agent.tgz',
        displayName: 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent 3312.17'
      }
    ]
    td.when(fakeUpgradeChecker.upgradeableReleases())
      .thenCallback(null, [])
    td.when(fakeUpgradeChecker.upgradeableStemcells())
      .thenCallback(null, newStemcells)

    td.when(fakeUpgradeApplier.upgradeStemcells(newStemcells))
      .thenCallback(null, newStemcells)

    alice.say('@bot upgrade!')

    var responses = testController.responses()
    expect(responses.length).to.eql(3)
    expect(responses[0], 'no response found').to.not.be.null
    expect(responses[0]).to.contain('alice')
    expect(responses[0]).to.contain('upgrades')

    expect(responses[1], 'no response found').to.not.be.null
    expect(responses[1]).to.contain('alice')
    expect(responses[1]).to.contain('aws')
    expect(responses[1]).to.contain('3312.17')

    expect(responses[2], 'no response found').to.not.be.null
    expect(responses[2]).to.contain('alice')
    expect(responses[2]).to.contain('upgraded')
  })

  it('lets the user know if there are no upgrades', function () {
    td.when(fakeUpgradeChecker.upgradeableReleases())
      .thenCallback(null, [])
    td.when(fakeUpgradeChecker.upgradeableStemcells())
      .thenCallback(null, [])

    alice.say('@bot upgrade!')

    var responses = testController.responses()
    expect(responses.length).to.eql(2)
    expect(responses[0], 'no response found').to.not.be.null
    expect(responses[0]).to.contain('alice')
    expect(responses[0]).to.contain('upgrades')

    expect(responses[1], 'no response found').to.not.be.null
    expect(responses[1]).to.contain('alice')
    expect(responses[1]).to.contain("I'm sorry")

    td.verify(fakeUpgradeApplier.upgradeReleases(), {times: 0, ignoreExtraArgs: true})
    td.verify(fakeUpgradeApplier.upgradeStemcells(), {times: 0, ignoreExtraArgs: true})
  })

  it('does not upload anything if no newer versions exist', function () {
    td.when(fakeUpgradeChecker.upgradeableReleases())
      .thenCallback(null, [])
    td.when(fakeUpgradeChecker.upgradeableStemcells())
      .thenCallback(null, [])

    fakeClock.tick('01:00:01')

    var resp = testController.response()
    expect(resp, 'response found').to.be.null

    td.verify(fakeUpgradeApplier.upgradeReleases(), {times: 0, ignoreExtraArgs: true})
    td.verify(fakeUpgradeApplier.upgradeStemcells(), {times: 0, ignoreExtraArgs: true})
  })
})
