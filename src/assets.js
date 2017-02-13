var GitAsset = require('./git_asset');
var path = require('path');
var async = require('async');

function Assets(config = {}) {
  var assets = {
    dir: config.dir,
  };

  var git = GitAsset();

  assets.fetch = function(assetConfig, cb) {
    console.log(`Fetching ${assetConfig.name}...`);

    switch(assetConfig.type) {
      case 'git':
        git.fetch(assetConfig, path.join(assets.dir, assetConfig.name), function(err) {
          if (err) {
            console.log(`Failed fetching ${assetConfig.name}: ${err}`);
          } else {
            console.log(`Done fetching ${assetConfig.name}.`);
          }
          cb(err);
        });
        break;
      default:
        cb(new Error(`Unrecognized type '${assetConfig.type}'`));
    }
  };

  assets.fetchAll = function(assetConfigs, cb) {
    var fetchFuncs = [];
    assetConfigs.forEach(function(asset) {
      fetchFuncs.push(function(nestedCb) {
        assets.fetch(asset, nestedCb);
      });
    });
    async.parallel(fetchFuncs, cb);
  };

  return assets;
}

module.exports = Assets;
