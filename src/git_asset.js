var fs = require('fs');
var Git = require('nodegit');

function GitClient() {

  var client = {};

  client.fetch = function(gitConfig, targetDir, cb) {
    var uri = gitConfig.uri;
    var branch = gitConfig.branch || 'master';

    fs.access(targetDir, fs.constants.W_OK, function(err) {
      var shouldUpdateAsset = (err == null);

      if (shouldUpdateAsset) {
        var repo = nil;
        Git.Repository.open(targetDir).then(function(r) {
          repo = r;
          return repo.fetch('origin');
        })
        .then(function() {
          return repo.getBranchCommit(`origin/${branch}`);
        })
        .then(function(commit) {
          return Git.Reset.reset(repo, commit, Reset.TYPE.HARD);
        })
        .catch(cb);
      } else {
        Git.Clone(uri, targetDir).then(function() { cb(null); }).catch(cb)
      }
    });
  };

  return client;
}

module.exports = GitClient;
