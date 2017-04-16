
function UpgradeApplier(config) {
  var applier = {
    boshRunner: config.boshRunner,
  };

  applier.upgradeStemcells = function(stemcells, cb) {
    var stemcellURLsToUpload = stemcells.map(function(r) { return r.url; });
    if (stemcellURLsToUpload.length == 0) {
      cb(null, []);
      return;
    }

    applier.boshRunner.uploadStemcells(stemcellURLsToUpload, function(err) {
      if (err != null) {
        cb(err, []);
        return;
      }

      cb(null, stemcells);
    });
  };

  applier.upgradeReleases = function(releases, cb) {
    var releaseURLsToUpload = releases.map(function(r) { return r.url; });
    if (releaseURLsToUpload.length == 0) {
      cb(null, []);
      return;
    }

    applier.boshRunner.uploadReleases(releaseURLsToUpload, function(err) {
      if (err != null) {
        cb(err, []);
        return;
      }

      cb(null, releases);
    });
  };

  return applier;
}

module.exports = UpgradeApplier;
