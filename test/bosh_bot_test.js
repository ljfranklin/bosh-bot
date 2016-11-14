var expect = require('chai').expect;
var TestBot = require('../src/test_bot');
var BoshBot = require('../src/bosh_bot');

describe('BoshBot', function(){
  var testController;
  var alice;

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

    var bot = new BoshBot();
    bot.setup(testController)
  });

  describe('greetings', function(){
    it('says hi back', function() {
      alice.say('@bot hello');
      expect(testController.response()).to.eql('<@alice> Hello yourself.');
    });

    it('replies with pong', function() {
      alice.say('@bot ping');
      expect(testController.response()).to.eql('<@alice> pong');
    });
  });
});
