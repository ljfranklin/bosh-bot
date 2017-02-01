var fs = require('fs');
var pki = require('node-forge').pki;
var ssh = require('node-forge').ssh;
var async = require('async');
var crypto = require('crypto');
var Git = require('nodegit');

var defaultUserName = 'bosh-bot';

function GitClient() {

  var client = {};

  client.fetch = function(gitConfig, targetDir, cb) {
    var uri = gitConfig.uri;
    var branch = gitConfig.branch || 'master';
    var deployKey = gitConfig.deploy_key;

    var cloneOpts = {};
    fs.access(targetDir, fs.constants.W_OK, function(err) {
      var shouldUpdateAsset = (err == null);

      var keyCb = function(kcb) { kcb(); };
      var cleanupCb = function(ccb) { ccb(); };

      if (deployKey) {
        var uuid = crypto.randomBytes(16).toString('hex');
        // TODO: move to configurable temp dir
        var privateKeyPath = `/tmp/deploy-key-${uuid}.pem`;
        var publicKeyPath = `/tmp/deploy-key-${uuid}.pub`;
        var writeOpts = { mode: 0o600 };

        cleanupCb = function(ccb) {
          fs.unlink(privateKeyPath, function(_) {
            fs.unlink(publicKeyPath, ccb);
          });
        };
        keyCb = function(kcb) {
          fs.writeFile(privateKeyPath, deployKey, writeOpts, function(err) {
            if (err) {
              kcb(err);
              return;
            }

            var pkPrivate = pki.privateKeyFromPem(deployKey);
            var pkPublic = pki.setRsaPublicKey(pkPrivate.n, pkPrivate.e);
            var publicKey = ssh.publicKeyToOpenSSH(pkPublic);

            fs.writeFile(publicKeyPath, publicKey, writeOpts, kcb);
	  });
        };
        cloneOpts.fetchOpts = {
          callbacks: {
            // Possibly required in OSX:
            // https://github.com/nodegit/nodegit/tree/master/guides/cloning/gh-two-factor#github-certificate-issue-in-os-x
            // certificateCheck: function() { return 1; },
            credentials: function(_, userName) {
              return Git.Cred.sshKeyNew(userName, publicKeyPath, privateKeyPath, '');
            }
          }
        };
      }

      async.series([
        keyCb,
        function(nestedCb) {
          if (shouldUpdateAsset) {
            var repo = null;
            Git.Repository.open(targetDir)
              .then(function(r) {
                repo = r;
                return repo.fetch('origin', cloneOpts.fetchOpts);
              })
              .then(function() {
                return repo.getBranchCommit(`origin/${branch}`);
              })
              .then(function(commit) {
                return Git.Reset.reset(repo, commit, Git.Reset.TYPE.HARD);
              })
              .then(nestedCb)
              .catch(nestedCb);
          } else {
            Git.Clone(uri, targetDir, cloneOpts).then(function() { nestedCb(null); }).catch(nestedCb)
          }
        },
        cleanupCb,
      ], cb);
    });
  };

  return client;
}

module.exports = GitClient;
