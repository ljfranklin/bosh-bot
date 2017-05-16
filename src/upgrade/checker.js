var semver = require('semver')
var async = require("async");
var request = require("request");

function UpgradeChecker (config) {
  var checker = {
    boshRunner: config.boshRunner,
    boshioClient: config.boshioClient,
    stemcells: config.stemcells || [],
    releases: config.releases || []
  }

  checker.upgradeableStemcells = function (cb) {
    if (checker.stemcells.length === 0) {
      cb(null, [])
      return
    }

    var stemcellIDs = checker.stemcells.map(function (stemcell) {
      return stemcell.boshio_id
    })

    checker.boshioClient.getLatestStemcellVersions(stemcellIDs, function (err, boshioVersions) {
      if (err != null) {
        cb(err, [])
        return
      }

      checker.boshRunner.getLatestStemcellVersions(function (err, directorVersions) {
        if (err) {
          cb(err, [])
          return
        }

        var stemcellsToUpload = filterNewerVersions(checker.stemcells, directorVersions, boshioVersions)

        stemcellsToUpload.forEach(function(stemcell) {
          stemcell.displayName = `${stemcell.name} ${stemcell.version}`
        })

        cb(null, stemcellsToUpload)
      })
    })
  }

  checker.upgradeableReleases = function (cb) {
    if (checker.releases.length === 0) {
      cb(null, [])
      return
    }

    var releaseIDs = checker.releases.map(function (release) {
      return release.boshio_id
    })

    checker.boshioClient.getLatestReleaseVersions(releaseIDs, function (err, boshioVersions) {
      if (err != null) {
        cb(err, [])
        return
      }

      checker.boshRunner.getLatestReleaseVersions(function (err, directorVersions) {
        if (err != null) {
          cb(err, [])
          return
        }

        var releasesToUpload = filterNewerVersions(checker.releases, directorVersions, boshioVersions)

        async.map(releasesToUpload, function(release, callback) {
          if (release.boshioID.includes('github.com') === false) {
            callback(null, null)
            return
          }

          var releaseNotesURL = `https://${release.boshioID}/releases/tag/v${release.version}`
          request(releaseNotesURL, function (error, response, _) {
            if (!error && response.statusCode == 200) {
              callback(null, releaseNotesURL)
            } else {
              callback(null, null)
            }
          });
        }, function(_, results) {
          for (var i = 0; i < results.length; i++) {
            releasesToUpload[i].displayName = `${releasesToUpload[i].name} ${releasesToUpload[i].version}`

            var releaseNotesURL = results[i]
            if (releaseNotesURL) {
              releasesToUpload[i].displayName = `<${releaseNotesURL}|${releasesToUpload[i].displayName}>`
            }
          }

          cb(null, releasesToUpload)
        });
      })
    })
  }

  function filterNewerVersions (itemsToCheck, directorVersions, boshioVersions) {
    return itemsToCheck.map(function (item) {
      var boshioID = item.boshio_id
      var directorID = item.name || item.boshio_id
      var boshioResult = boshioVersions[boshioID]
      var directorResult = directorVersions[directorID] || { version: '0.0.0' }

      var boshioVersion = boshioResult.version
      while (boshioVersion.match(/\./g).length < 2) {
        boshioVersion += '.0'
      }
      var directorVersion = directorResult.version
      while (directorVersion.match(/\./g).length < 2) {
        directorVersion += '.0'
      }
      if (semver.gt(boshioVersion, directorVersion)) {
        return {
          name: directorID,
          boshioID: boshioID,
          url: boshioResult.url,
          version: boshioResult.version
        }
      }
      return null
    }).filter(function (element) { return element != null })
  }

  return checker
};

module.exports = UpgradeChecker
