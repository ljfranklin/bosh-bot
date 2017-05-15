var yaml = require('js-yaml')
var fs = require('fs')
var path = require('path')
var util = require('util')

function Personality (name) {
  var personality = {
    name: name,
    sayings: {}
  }

  personality.loadSync = function () {
    var configPath = path.join(__dirname, '..', 'personalities', `${name}.yml`)
    try {
      personality.sayings = yaml.safeLoad(fs.readFileSync(configPath, 'utf8'))
    } catch (ex) {
      return new Error(`Failed to load config file at '${configPath}': ${ex}`)
    }

    return null
  }

  personality.reply = function (opts) {
    var text = `<@${opts.user}> ${personality.sayings[opts.key]}`
    if (opts.args) {
      text = util.format(text, ...opts.args)
    }
    return text
  }

  personality.say = function (opts) {
    var text = `${personality.sayings[opts.key]}`
    if (opts.args) {
      text = util.format(text, ...opts.args)
    }
    return text
  }

  return personality
};

module.exports = Personality
