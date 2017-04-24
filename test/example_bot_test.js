var expect = require('chai').expect
var TestBot = require('../src/test_bot')
var ExampleBot = require('../src/example_bot')

describe('ExampleBot', function () {
  var testController
  var alice

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

    alice = testController.createUser({
      user: 'alice'
    })

    var bot = new ExampleBot()
    bot.setup(testController)
  })

  describe('greetings', function () {
    it('says hi back', function () {
      alice.say('@bot hello')
      expect(testController.responses()).to.eql(['Hello yourself.'])
    })
  })

  describe('ping', function () {
    it('says pong on a direct_mention', function () {
      alice.say('@bot ping')
      expect(testController.response()).to.eql('<@alice> pong')
    })

    it('does not respond on an ambient message', function () {
      alice.say('ping')
      expect(testController.responses()).to.eql([])
    })
  })

  describe('pizzatime', function () {
    it('asks for your order', function () {
      alice.say('pizzatime')
      expect(testController.response()).to.eql('<@alice> What flavor of pizza do you want?')

      alice.say('@bot california veggie')
      expect(testController.response()).to.eql('<@alice> Okay, one *california veggie*.')
      expect(testController.response()).to.eql('<@alice> What size?')
      alice.say('@bot extra small')
      expect(testController.response()).to.eql('<@alice> Your *extra small california veggie* pizza will be ready shortly.')
    })
  })
})
