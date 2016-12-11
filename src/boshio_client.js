var yaml = require('js-yaml');
var https = require('https');
var async = require('async');

function BoshioClient() {
  var client = {};

  client.getLatestReleaseVersion = function(releaseID, cb) {
    console.log(`Checking for bosh.io release versions of '${releaseID}'...`);
    https.get(`https://bosh.io/api/v1/releases/${releaseID}`, function(response) {
      if (response.statusCode < 200 || response.statusCode >= 300) {
        cb(new Error(`Failed to fetch boshio release versions: ${response}`), {});
        return;
      }

      var body = '';
      response.on('data', function(d) {
        body += d;
      });
      response.on('end', function() {
        var parsed = yaml.safeLoad(body);
        var latest = parsed[0]; // assumes first result has highest semver
        console.log(`Found version '${JSON.stringify(latest)}' for '${releaseID}'!`);
        cb(null, latest);
      });
    });
  }
  client.getLatestReleaseVersions = function(releaseIDs, cb) {
    var parallelFuncs = {};
    releaseIDs.forEach(function(releaseID) {
      parallelFuncs[releaseID] = function(cb) {
        client.getLatestReleaseVersion(releaseID, cb);
      };
    });

    async.parallel(parallelFuncs, cb);
  };

  return client;
}

module.exports = BoshioClient;
