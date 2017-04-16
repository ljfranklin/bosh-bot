var expect = require('chai').expect;
var td = require('testdouble');

var BoshRunner = require('../../src/bosh_runner');
var UpgradeApplier = require('../../src/actions/upgrade_applier');

describe('UpgradeApplier', function() {

  var fakeRunner;
  var applier;

  beforeEach(function() {
    fakeRunner = td.object(BoshRunner());

    applier = UpgradeApplier({
      boshRunner: fakeRunner,
    });
  });

  describe('#upgradeStemcells', function() {
    it('uploads the given stemcells to the Director', function(done) {
      var stemcells = [{
        url: 'fake-url',
      }, {
        url: 'another-fake-url',
      }];

      td.when(fakeRunner.uploadStemcells(['fake-url', 'another-fake-url']))
        .thenCallback(null);

      applier.upgradeStemcells(stemcells, function(err, uploadedStemcells) {
        expect(err).to.be.null;
        expect(uploadedStemcells).to.eql(stemcells);
        td.verify(fakeRunner.uploadStemcells(['fake-url', 'another-fake-url'], td.matchers.isA(Function)));

        done();
      });
    });
  });

  describe('#upgradeReleases', function() {
    it('uploads the given releases to the Director', function(done) {
      var releases = [{
        url: 'fake-url',
      }, {
        url: 'another-fake-url',
      }];

      td.when(fakeRunner.uploadReleases(['fake-url', 'another-fake-url']))
        .thenCallback(null);

      applier.upgradeReleases(releases, function(err, uploadedReleases) {
        expect(err).to.be.null;
        expect(uploadedReleases).to.eql(releases);
        td.verify(fakeRunner.uploadReleases(['fake-url', 'another-fake-url'], td.matchers.isA(Function)));

        done();
      });
    });
  });
});
