var yaml = require('js-yaml')
var https = require('https')
var async = require('async')

function BoshioClient () {
  var client = {}

  client.getLatestReleaseVersion = function (releaseID, cb) {
    console.log(`Checking for bosh.io release versions of '${releaseID}'...`)
    https.get(`https://bosh.io/api/v1/releases/${releaseID}`, function (response) {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        cb(new Error(`Failed to fetch boshio release versions`), {})
        return
      }

      var body = ''
      response.on('data', function (d) {
        body += d
      })
      response.on('end', function () {
        var parsed = yaml.safeLoad(body)
        var latest = parsed[0] // assumes first result has highest semver
        console.log(`Found version '${JSON.stringify(latest)}' for '${releaseID}'!`)
        cb(null, latest)
      })
    })
  }
  client.getLatestReleaseVersions = function (releaseIDs, cb) {
    var parallelFuncs = {}
    releaseIDs.forEach(function (releaseID) {
      parallelFuncs[releaseID] = function (cb) {
        client.getLatestReleaseVersion(releaseID, cb)
      }
    })

    async.parallel(parallelFuncs, cb)
  }

  client.getLatestStemcellVersion = function (stemcellID, cb) {
    console.log(`Checking for bosh.io stemcell versions of '${stemcellID}'...`)
    https.get(`https://bosh.io/api/v1/stemcells/${stemcellID}`, function (response) {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        cb(new Error(`Failed to fetch boshio stemcell versions`), {})
        return
      }

      var body = ''
      response.on('data', function (d) {
        body += d
      })
      response.on('end', function () {
        var stemcells = yaml.safeLoad(body)
        if (stemcells.length === 0) {
          cb(new Error(`Did not find any matches for '${stemcellID}'`), {})
          return
        }

        var lightStemcell = stemcells.find(function (stemcell) {
          return stemcell.hasOwnProperty('light')
        })

        var targetStemcell = null
        if (lightStemcell) {
          targetStemcell = lightStemcell
          targetStemcell['url'] = targetStemcell['light']['url']
        } else {
          targetStemcell = stemcells[0]
          targetStemcell['url'] = targetStemcell['regular']['url']
        }
        delete targetStemcell['light']
        delete targetStemcell['regular']

        console.log(`Found version '${JSON.stringify(targetStemcell)}' for '${stemcellID}'!`)

        cb(null, targetStemcell)
      })
    })
  }
  client.getLatestStemcellVersions = function (stemcellIDs, cb) {
    var parallelFuncs = {}
    stemcellIDs.forEach(function (stemcellID) {
      parallelFuncs[stemcellID] = function (nestedCb) {
        client.getLatestStemcellVersion(stemcellID, nestedCb)
      }
    })

    async.parallel(parallelFuncs, cb)
  }

  return client
}

module.exports = BoshioClient
