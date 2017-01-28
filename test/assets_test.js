var expect = require('chai').expect;
var td = require('testdouble');
var proxyquire = require('proxyquire');
var GitAsset = require('../src/git_asset');

describe('Assets', function() {
  var assets;
  var fakeGitAsset;
  var assetsDir = 'my/fake/assets/path';

  beforeEach(function() {
    fakeGitAsset = td.object(GitAsset());

    var Assets = proxyquire('../src/assets', {
      './git_asset': function() {
        return fakeGitAsset;
      },
    });

    assets = Assets({
      dir: assetsDir,
    });
  });

  afterEach(function(){
    td.reset();
  });

  describe('#fetch', function() {
    it('fetches an asset of type git', function(done) {
      var assetConfig = {
        type: 'git',
        uri: 'https://fake-git-uri.git',
      }

      td.when(fakeGitAsset.fetch(assetConfig, `${assetsDir}/deployments`))
        .thenCallback(null);
      assets.fetch('deployments', assetConfig, function(err) {
        expect(err).to.be.null;
        done();
      });
    });

    it('returns an error on unknown type', function(done) {
      var assetConfig = {
        type: 'invalid-type',
        uri: 'https://fake-git-uri.git',
      }

      assets.fetch('deployments', assetConfig, function(err) {
        expect(err).to.not.be.null;
        expect(err.message).to.include('invalid-type');
        done();
      });
    });
  });

  describe('#fetchAll', function() {
    it('fetches all assets', function(done) {
      var assetConfigs = {
        first: {
          type: 'git',
          uri: 'https://first.git'
        },
        second: {
          type: 'git',
          uri: 'https://second.git'
        }
      };

      td.when(fakeGitAsset.fetch(assetConfigs['first'], `${assetsDir}/first`))
        .thenCallback(null);
      td.when(fakeGitAsset.fetch(assetConfigs['second'], `${assetsDir}/second`))
        .thenCallback(null);

      assets.fetchAll(assetConfigs, function(err) {
        expect(err).to.be.null;
        done();
      });
    });

    it('returns an error on unknown type', function(done) {
      var assetConfigs = {
        first: {
          type: 'git',
          uri: 'https://first.git'
        },
        second: {
          type: 'invalid-type',
          uri: 'https://second.git'
        }
      };

      assets.fetchAll(assetConfigs, function(err) {
        expect(err).to.not.be.null;
        expect(err.message).to.include('invalid-type');
        done();
      });
    });
  });
});
