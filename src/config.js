var yaml = require('js-yaml')
var fs = require('fs')

function Config (configPath) {
  var config = {}
  var contents = {}

  var requiredProperties = [
    'slack.token',
    'slack.authorized_usernames',
    'bosh.env',
    'bosh.user',
    'bosh.password'
  ]
  var defaultContents = {
    bosh: {
      releases: [],
      stemcells: [],
      deployments: [],
      assets: []
    }
  }

  config.loadSync = function () {
    try {
      contents = yaml.safeLoad(fs.readFileSync(configPath, 'utf8'))
    } catch (ex) {
      return new Error(`Failed to load config file at '${configPath}': ${ex}`)
    }

    Object.keys(defaultContents).forEach(function (key) {
      contents[key] = Object.assign(defaultContents[key], contents[key])
    })

    return validate()
  }

  config.get = function (key) {
    var fields = key.split('.')

    var curr = contents
    fields.forEach(function (field) {
      if (curr && curr.constructor === Object) {
        curr = curr[field]
      } else {
        return null
      }
    })

    return curr
  }

  function validate () {
    var missingFields = []
    requiredProperties.forEach(function (requiredField) {
      if (config.get(requiredField) == null) {
        missingFields.push(requiredField)
      }
    })

    if (missingFields.length > 0) {
      return new Error(`Missing required config properties: ${missingFields.join(', ')}`)
    } else {
      return null
    }
  }

  return config
};

module.exports = Config
