var expect = require('chai').expect
var td = require('testdouble')
var TestBot = require('../../src/test_bot')
var Auth = require('../../src/slack/auth')
var Personality = require('../../src/personality')

describe('Slack Auth', function () {
  var auth
  var testController
  var alice

  beforeEach(function () {
    testController = TestBot()
    testController.spawn()

    testController.addEventTrigger('ambient', function (message) {
      return message
    })
    testController.hears('.*', ['ambient'], function (bot, message) {
      bot.reply(message, 'pong')
    })

    alice = testController.createUser({
      user: '123'
    })

    var personality = Personality('captain_bucky')
    var err = personality.loadSync()
    expect(err).to.be.null

    auth = Auth({
      authorizedUsers: [
        'alice'
      ],
      authorizedChannels: [],
      personality: personality
    })
  })

  afterEach(function () {
    td.reset()
  })

  describe('#addHandler', function () {
    it('responds to known users', function () {
      var fakeResponse = {
        users: [
          {
            id: '123',
            name: 'alice'
          }
        ],
        channels: []
      }
      var err = auth.addHandler(testController, fakeResponse)
      expect(err).to.be.null

      alice.say('@bot ping')
      var resp = testController.response()
      expect(resp, 'no response found').to.not.be.null
      expect(resp).to.include('pong')
    })

    it('tells an unknown user that they do not have permission', function () {
      var fakeResponse = {
        users: [
          {
            id: '123',
            name: 'alice'
          }
        ],
        channels: []
      }
      var err = auth.addHandler(testController, fakeResponse)
      expect(err).to.be.null

      var becky = testController.createUser({
        user: 'becky',
        id: '456'
      })

      becky.say('@bot ping')
      var resp = testController.response()
      expect(resp, 'no response found').to.not.be.null
      expect(resp).to.include('ticket')
    })

    it('responds if user is in an authorized channel', function () {
      auth = Auth({
        authorizedUsers: [
          'becky'
        ],
        authorizedChannels: [
          'testing'
        ]
      })

      var fakeResponse = {
        users: [
          {
            id: '456',
            name: 'becky'
          }
        ],
        channels: [
          {
            id: '123',
            name: 'testing'
          }
        ]
      }
      var err = auth.addHandler(testController, fakeResponse)
      expect(err).to.be.null

      var becky = testController.createUser({
        user: '456',
        channel: '123'
      })

      becky.say('@bot ping')
      expect(testController.response()).to.contain('pong')
    })

    it('does not respond if not in an authorized channel', function () {
      auth = Auth({
        authorizedUsers: [
          'becky'
        ],
        authorizedChannels: [
          'testing'
        ]
      })

      var fakeResponse = {
        users: [
          {
            id: '456',
            name: 'becky'
          }
        ],
        channels: [
          {
            id: '123',
            name: 'testing'
          }
        ]
      }
      var err = auth.addHandler(testController, fakeResponse)
      expect(err).to.be.null

      var becky = testController.createUser({
        user: '456',
        channel: 'non-authorized-channel'
      })

      becky.say('@bot ping')
      expect(testController.response()).to.be.null
    })
  })
})
