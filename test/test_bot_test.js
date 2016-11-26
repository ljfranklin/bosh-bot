var expect = require('chai').expect;
var TestBot = require('../src/test_bot');
var Botkit = require('botkit');

describe('TestBot', function(){
  describe('#createUser()', function() {
    it('triggers message_received callback', function(done) {
      var controller = TestBot();
      controller.spawn();

      controller.on('message_received', function(bot,message) {
        expect(message.user).to.eql('alice');
        expect(message.text).to.eql('hello');
        done();
      });

      alice = controller.createUser({
        user: 'alice'
      });
      alice.say('hello');
    });
  });

  describe('#identity', function() {
    it('returns the default name and id', function(done) {
      var controller = TestBot();

      controller.middleware.spawn.use(function(bot, next) {
        expect(bot.identity.id).to.eql('0');
        expect(bot.identity.name).to.eql('bot');

        next();
        done();
      });

      controller.spawn();
    });

    it('returns the given name and id', function(done) {
      var controller = TestBot({
        id: '9999',
        name: 'my-fake-bot',
      });

      controller.middleware.spawn.use(function(bot, next) {
        expect(bot.identity.id).to.eql('9999');
        expect(bot.identity.name).to.eql('my-fake-bot');

        next();
        done();
      });

      controller.spawn();
    });
  })

  describe('#response()', function(){
    it('return the last message sent by the bot', function() {
      var controller = TestBot();
      controller.spawn();

      controller.say('hello');
      expect(controller.response()).to.eql('hello');

      controller.say('hi');
      expect(controller.response()).to.eql('hi');
    });

    it('returns the responses in order', function() {
      var controller = TestBot();
      controller.spawn();

      controller.say('hello');
      controller.say('hi');

      expect(controller.response()).to.eql('hello');
      expect(controller.response()).to.eql('hi');
    });
  });

  describe('#responses()', function(){
    it('returns all messages sent by the bot', function() {
      var controller = TestBot();
      controller.spawn();

      controller.say('hi');
      controller.say('hello');
      expect(controller.responses()).to.eql(['hi', 'hello']);
    });

    it('returns replies', function(done) {
      var controller = TestBot();
      controller.spawn();

      controller.hears('hello',['message_received'],function(bot,message) {
        bot.reply(message, 'hi');
        bot.reply(message, 'hi again');

        expect(controller.responses()).to.eql(['hi', 'hi again']);
        done();
      });

      alice = controller.createUser({
        user: 'alice'
      });
      alice.say('hello');
    });
  });

  describe('#addEventTrigger', function() {
    it('triggers the given event when the callback returns the message', function(done) {
      var controller = TestBot();
      controller.spawn();

      controller.addEventTrigger('direct_mention', function(message) {
        if (message.text.includes('@bot')) {
          return message
        }
        return null
      });

      controller.on('direct_mention', function(bot, message) {
        expect(message.text).to.include('hello');
        done();
      });

      alice = controller.createUser({
        user: 'alice'
      });
      alice.say('talking to myself');
      alice.say('@bot hello');
    });

    it('allows modification of the message', function(done) {
      var controller = TestBot();
      controller.spawn();

      controller.addEventTrigger('direct_mention', function(message) {
        if (message.text.includes('@bot')) {
          message.text = message.text.replace(/@bot\s+/, '');
          return message;
        }
        return null;
      });

      controller.on('direct_mention', function(bot, message) {
        expect(message.text).to.eql('hello');
        done();
      });

      alice = controller.createUser({
        user: 'alice'
      });
      alice.say('@bot hello');
    });

    it('triggers the appropriate event when multiple triggers are given', function(done) {
      var controller = TestBot();
      controller.spawn();

      controller.addEventTrigger('direct_mention', function(message) {
        return null;
      });
      controller.addEventTrigger('ambient', function(message) {
        return message;
      });

      controller.on('direct_mention', function(bot, message) {
        throw new Error('Expected direct_mention to not be called');
      });
      controller.on('ambient', function(bot, message) {
        expect(message.text).to.eql('hello');
        done();
      });

      alice = controller.createUser({
        user: 'alice'
      });
      alice.say('hello');
    });
  });

  describe('#startConversation', function() {
    it('begins a conversation', function(done) {
      var controller = TestBot({
        debug: true
      });
      controller.spawn();

      controller.on('message_received', function(bot, message) {
        bot.startConversation(message, function(response, convo) {
          convo.say('hello to you too');
          convo.next();

          expect(controller.response()).to.eql('hello to you too');
          done();
        });
      });

      var alice = controller.createUser({
        user: 'alice'
      });
      alice.say('hello');
    });

    it('records multiple responses', function(done) {
      var controller = TestBot({
        debug: true
      });
      controller.spawn();

      controller.on('message_received', function(bot, message) {
        bot.startConversation(message, function(response, convo) {
          convo.say('hello');
          convo.say('hello again');
          convo.next();

          expect(controller.responses()).to.eql(['hello', 'hello again']);
          done();
        });
      });

      var alice = controller.createUser({
        user: 'alice'
      });
      alice.say('hello');
    });

    it('asks a question', function(done) {
      var controller = TestBot({
        debug: true
      });
      controller.spawn();

      controller.on('message_received', function(bot, message) {
        var askFlavor = function(response, convo) {
          convo.ask('What flavor of pizza do you want?', function(response, convo) {
            convo.say('Awesome.');
            askSize(response, convo);
            convo.next();
          });
        };
        var askSize = function(response, convo) {
          convo.ask('What size do you want?', function(response, convo) {
            convo.say('Ok.')
            askWhereDeliver(response, convo);
            convo.next();
          });
        };
        var askWhereDeliver = function(response, convo) {
          convo.ask('So where do you want it delivered?', function(response, convo) {
            convo.say('Ok! Good bye.');
            convo.next();
          });
        };

        bot.startConversation(message, askFlavor);

        controller.on('conversationEnded', function() {
          expect(controller.responses()).to.eql([
            'What flavor of pizza do you want?',
            'Awesome.',
            'What size do you want?',
            'Ok.',
            'So where do you want it delivered?',
            'Ok! Good bye.',
          ]);
          done();
        });
      });

      var alice = controller.createUser({
        user: 'alice'
      });
      alice.say('pizzatime');
      alice.say('hawaiian');
      alice.say('medium');
      alice.say('my house');
    });

    it('repeats the question', function(done) {
      var controller = TestBot();
      controller.spawn();

      controller.on('message_received', function(bot, message) {
        bot.startConversation(message, function(response, convo) {
          convo.ask('What flavor of pizza do you want?', function(response, convo) {
            convo.say("Sorry didn't catch that");
            convo.repeat();
            convo.next();

            expect(controller.responses()).to.eql([
              'What flavor of pizza do you want?',
              "Sorry didn't catch that",
              'What flavor of pizza do you want?'
            ]);
            done();
          });
        });
      });

      alice = controller.createUser({
        user: 'alice'
      });
      alice.say('pizzatime');
      alice.say('BBQ');
    });
  });
});
