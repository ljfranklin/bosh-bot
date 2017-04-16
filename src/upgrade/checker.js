var semver = require('semver');

function UpgradeChecker(config) {
  var checker = {
    boshRunner: config.boshRunner,
    boshioClient: config.boshioClient,
    stemcells: config.stemcells || [],
    releases: config.releases || [],
  };

  checker.upgradeableStemcells = function(cb) {
    if (checker.stemcells.length == 0) {
      cb(null, []);
      return;
    }

    var stemcellIDs = checker.stemcells.map(function(stemcell) {
      return stemcell.boshio_id;
    });

    checker.boshioClient.getLatestStemcellVersions(stemcellIDs, function(err, boshioVersions) {
      if (err != null) {
        cb(err, []);
        return;
      }

      checker.boshRunner.getLatestStemcellVersions(function(err, directorVersions) {
        if (err != null) {
          cb(err, []);
          return;
        }

        var stemcellsToUpload = filterNewerVersions(checker.stemcells, directorVersions, boshioVersions);
        cb(null, stemcellsToUpload);
      });
    });
  };

  checker.upgradeableReleases = function(cb) {
    if (checker.releases.length == 0) {
      cb(null, []);
      return;
    }

    var releaseIDs = checker.releases.map(function(release) {
      return release.boshio_id;
    });

    checker.boshioClient.getLatestReleaseVersions(releaseIDs, function(err, boshioVersions) {
      if (err != null) {
        cb(err, []);
        return;
      }

      checker.boshRunner.getLatestReleaseVersions(function(err, directorVersions) {
        if (err != null) {
          cb(err, []);
          return;
        }

        var releasesToUpload = filterNewerVersions(checker.releases, directorVersions, boshioVersions);
        cb(null, releasesToUpload);
      });
    });
  };

  function filterNewerVersions(itemsToCheck, directorVersions, boshioVersions) {
    return itemsToCheck.map(function(item) {
      var boshioID = item.boshio_id;
      var directorID = item.name || item.boshio_id;
      var boshioResult = boshioVersions[boshioID];
      var directorResult = directorVersions[directorID] || { version: '0.0.0' };

      boshioVersion = boshioResult.version;
      while (boshioVersion.match(/\./g).length < 2) {
        boshioVersion += '.0';
      }
      directorVersion = directorResult.version;
      while (directorVersion.match(/\./g).length < 2) {
        directorVersion += '.0';
      }
      if (semver.gt(boshioVersion, directorVersion)) {
        return {
          name: directorID,
          url: boshioResult.url,
          version: boshioResult.version,
          displayName: `${directorID} ${boshioResult.version}`,
        };
      }
      return null;
    }).filter(function(element) { return element != null });
  }

  return checker;
};

module.exports = UpgradeChecker;
