var GitAsset = require('./git_asset');
var path = require('path');
var async = require('async');

function Assets(config = {}) {
  var assets = {
    dir: config.dir,
  };

  var git = GitAsset();

  assets.fetch = function(assetName, assetConfig, cb) {
    switch(assetConfig.type) {
      case 'git':
        git.fetch(assetConfig, path.join(assets.dir, assetName), cb);
        break;
      default:
        cb(new Error(`Unrecognized type '${assetConfig.type}'`));
    }
  };

  assets.fetchAll = function(assetConfigs, cb) {
    var fetchFuncs = [];
    Object.keys(assetConfigs).forEach(function(assetName) {
      fetchFuncs.push(function(nestedCb) {
        assets.fetch(assetName, assetConfigs[assetName], nestedCb);
      });
    });
    async.parallel(fetchFuncs, cb);
  };

  return assets;
}

module.exports = Assets;
