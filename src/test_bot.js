var Botkit = require('botkit');
var td = require('testdouble');

function Testbot(configuration) {
    configuration = configuration || {};

    var test_botkit = Botkit.core(configuration);

    test_botkit.defineBot(function(botkit, config) {

        var bot = {
            type: 'test',
            botkit: botkit,
            config: config || {},
            utterances: botkit.utterances,
            identity: {
              id: configuration.id || '0',
              name: configuration.name || 'bot',
            },
        };
        // allow caller to pass in arbitrary bot fields
        bot = Object.assign(bot, configuration);

        var responses = [];
        var responseCursor = 0;
        var eventTriggers = new Map();

        test_botkit.response = function() {
          if (responses.length == 0 || responseCursor >= responses.length) {
            return null;
          }

          var resp = responses[responseCursor];
          responseCursor++;
          if (resp.hasOwnProperty('text')) {
            return resp.text;
          }
          return resp;
        };

        test_botkit.responses = function() {
          return responses.map(function(resp) {
              if (resp.hasOwnProperty('text')) {
                return resp.text;
              }
              return resp;
          });
        };

        test_botkit.say = function(message) {
          bot.say(message);
        };

        test_botkit.createUser = function(userOpts) {
          return User(test_botkit, bot, userOpts);
        };

        test_botkit.addEventTrigger = function(eventName, eventPredicate) {
          if (!eventTriggers.has(eventName)) {
            eventTriggers.set(eventName, []);
          }
          eventTriggers.get(eventName).push(eventPredicate);
        };

        // TODO: replace this with middleware?
        test_botkit.on('message_received', function(eventBot, message) {
          eventTriggers.forEach(function(predicates, eventName) {
            predicates.forEach(function(predicate) {
              var eventMessage = predicate(message);
              if (eventMessage) {
                test_botkit.trigger(eventName, [eventBot, eventMessage]);
              }
            });
          })
        });

        bot.send = function(message, cb) {
          responses.push(message);
          cb && cb();
        };

        bot.reply = function(src, resp, cb) {
          bot.say(resp, cb);
        };

        bot.startConversation = function(message, cb) {
          botkit.startConversation(this, message, function(_, convo) {
            // HACK: is there a better way to invoke tick?
            var origNext = convo.next;
            convo.next = function() {
              origNext.apply(convo);
              while (convo.isActive() && convo.messages.length > 0) {
                convo.tick();
              }
            };

            cb(null, convo);
            convo.tick();
          });
        };
        //
        // bot.createConversation = function(message, cb) {
        //     botkit.createConversation(this, message, cb);
        // };

        bot.findConversation = function(message, cb) {
          for (var t = 0; t < botkit.tasks.length; t++) {
            var task = botkit.tasks[t];
            for (var c = 0; c < task.convos.length; c++) {
              var convo = task.convos[c];
              if (convo.isActive() && convo.source_message.user == message.user) {
                cb(convo);
                return;
              }
            }
          }
          cb();
        };

        return bot;
    });

    return test_botkit;
};

function User(botkit, bot, opts) {
  var user = {};

  user.say = function(messageText) {
    var message = {
      user: opts.user,
      channel: 'default',
      text: messageText
    };
    botkit.receiveMessage(bot, message);
  };

  return user;
}

module.exports = Testbot;
