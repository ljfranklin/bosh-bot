var GitAsset = require('./git_asset');
var path = require('path');
var async = require('async');

function Assets(config) {
  var assets = {
    dir: config.dir,
  };

  var git = GitAsset();

  assets.fetch = function(assetConfig, cb) {
    switch(assetConfig.type) {
      case 'git':
        git.fetch(assetConfig, path.join(assets.dir, assetConfig.name), cb);
        break;
      default:
        cb(new Error(`Unrecognized type '${assetConfig.type}'`));
    }
  };

  assets.fetchAll = function(assetConfigs, cb) {
    var fetchFuncs = [];
    assetConfigs.forEach(function(config) {
      fetchFuncs.push(function(nestedCb) {
        assets.fetch(config, nestedCb);
      });
    })
    async.parallel(fetchFuncs, cb);
  };

  return assets;
}

module.exports = Assets;
