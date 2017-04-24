var expect = require('chai').expect
var td = require('testdouble')
var proxyquire = require('proxyquire')

describe('Slack', function () {
  var fakeSlackbotFunc
  var fakeSlackbot
  var fakeController
  var slack

  beforeEach(function () {
    fakeController = td.object()
    fakeSlackbot = td.object()
    fakeSlackbotFunc = td.function()

    var Slack = proxyquire('../../src/slack/slack', {
      'botkit': {
        slackbot: fakeSlackbotFunc
      }
    })

    slack = Slack({
      token: 'fake-slack-token'
    })
  })

  afterEach(function () {
    td.reset()
  })

  describe('#start', function () {
    it('starts the slack client', function (done) {
      td.when(fakeSlackbotFunc({
        debug: false,
        retry: 10
      })).thenReturn(fakeController)

      td.when(fakeController.spawn({
        token: 'fake-slack-token',
        retry: Infinity
      })).thenReturn(fakeSlackbot)

      var fakeResponse = td.object({
        users: [
          {
            id: '1',
            name: 'alice'
          }
        ],
        channels: [
          {
            id: '2',
            name: 'testing'
          }
        ]
      })
      td.when(fakeSlackbot.startRTM()).thenCallback(null, null, fakeResponse)

      slack.start(function (err, controller, response) {
        expect(err).to.be.null
        expect(controller).to.eql(fakeController)
        expect(response).to.eql(fakeResponse)

        done()
      })
    })
  })
})
