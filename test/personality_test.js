var expect = require('chai').expect

var Personality = require('../src/personality.js')

describe('Personality', function () {
  var personality
  var fakeUser = 'fake-user-id'

  beforeEach(function () {
    personality = Personality('captain_bucky')
    var err = personality.loadSync()
    expect(err).to.be.null
  })

  it('returns a simple reply', function () {
    var opts = {
      user: fakeUser,
      key: 'hello'
    }
    expect(personality.reply(opts)).to.eql('<@fake-user-id> Hello yourself.')
  })

  it('returns a reply with args', function () {
    var opts = {
      user: fakeUser,
      key: 'upgrade_check_error',
      args: ['fake-error']
    }
    expect(personality.reply(opts)).to.eql('<@fake-user-id> Sorry, we hit a glitch trying to check for upgrades: fake-error.')
  })

  it('returns a simple saying', function () {
    var opts = {
      key: 'hello'
    }
    expect(personality.say(opts)).to.eql('Hello yourself.')
  })

  it('returns a saying with args', function () {
    var opts = {
      key: 'upgrade_check_error',
      args: ['fake-error']
    }
    expect(personality.say(opts)).to.eql('Sorry, we hit a glitch trying to check for upgrades: fake-error.')
  })
})
