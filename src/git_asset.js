var fs = require('fs');
var pki = require('node-forge').pki;
var ssh = require('node-forge').ssh;
var async = require('async');
var crypto = require('crypto');
var path = require('path');
var Git = require('simple-git');

var defaultUserName = 'bosh-bot';

function GitClient() {

  var client = {};

  client.fetch = function(gitConfig, targetDir, cb) {
    var uri = gitConfig.uri;
    var branch = gitConfig.branch || 'master';
    var deployKey = gitConfig.deploy_key;

    fs.access(targetDir, fs.constants.W_OK, function(err) {
      var shouldUpdateAsset = (err == null);

      var pathParts = path.parse(targetDir);

      var client = Git(pathParts.dir);

      var keyCb = function(kcb) { kcb(); };
      var cleanupCb = function(ccb) { ccb(); };

      if (deployKey) {
        var uuid = crypto.randomBytes(16).toString('hex');
        // TODO: move to configurable temp dir
        var privateKeyPath = `/tmp/deploy-key-${uuid}.pem`;
        var writeOpts = { mode: 0o600 };

        cleanupCb = function(ccb) {
          fs.unlink(privateKeyPath, ccb);
        };
        keyCb = function(kcb) {
          fs.writeFile(privateKeyPath, deployKey, writeOpts, function(err) {
            if (err) {
              kcb(err);
              return;
            }
            process.env.GIT_SSH_COMMAND = `ssh -i ${privateKeyPath} -F /dev/null`

            kcb();
	  });
        };
      }

      async.series([
        keyCb,
        function(nestedCb) {
          if (shouldUpdateAsset) {
            client.cwd(targetDir)
	      .checkout(branch, function(err) {
                if (err) {
	          nestedCb(err);
                }
	      }).pull(function(err) {
                nestedCb(err);
              });
          } else {
            client.clone(uri, pathParts.base, ['-b', branch], function(err) {
	      nestedCb(err);
            });
          }
        },
        cleanupCb,
      ], cb);
    });
  };

  return client;
}

module.exports = GitClient;
