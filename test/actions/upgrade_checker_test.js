var expect = require('chai').expect;
var td = require('testdouble');

var BoshRunner = require('../../src/bosh_runner');
var BoshioClient = require('../../src/boshio_client');
var UpgradeChecker = require('../../src/actions/upgrade_checker');

describe('UpgradeChecker', function() {

  var fakeRunner;
  var fakeBoshio;
  var checker;

  beforeEach(function() {
    fakeRunner = td.object(BoshRunner());
    fakeBoshio = td.object(BoshioClient());

    checker = UpgradeChecker({
      boshRunner: fakeRunner,
      boshioClient: fakeBoshio,
      stemcells: [
        {
          boshio_id: 'newer-stemcell',
        },
        {
          boshio_id: 'older-stemcell',
        }
      ],
      releases: [
        {
          name: 'new',
          boshio_id: 'newer-release',
        },
        {
          name: 'old',
          boshio_id: 'older-release',
        }
      ],
    });
  });

  describe('#upgradeableStemcells', function() {
    it('returns stemcells that have a higher version on boshio than director', function(done) {
      var boshioVersions = {
        'newer-stemcell': {
          name: 'newer-stemcell',
          version: '1.1',
          url: 'fake-new-url',
        },
        'older-stemcell': {
          name: 'older-stemcell',
          version: '0.1',
          url: 'fake-old-url',
        },
      }
      td.when(fakeBoshio.getLatestStemcellVersions(['newer-stemcell', 'older-stemcell']))
        .thenCallback(null, boshioVersions);

      var directorVersions = {
        'newer-stemcell': {
          version: '1.0',
        },
        'older-stemcell': {
          version: '0.1',
        },
      }
      td.when(fakeRunner.getLatestStemcellVersions())
        .thenCallback(null, directorVersions);

      checker.upgradeableStemcells(function(err, newStemcells) {
        expect(err).to.be.null;
        expect(newStemcells).to.eql([{
          name: 'newer-stemcell',
          version: '1.1',
          url: 'fake-new-url',
          displayName: 'newer-stemcell 1.1',
        }]);

        done();
      });
    });
  });

  describe('#upgradeableReleases', function() {
    it('returns releases that have a higher version on boshio than director', function(done) {
      var boshioVersions = {
        'newer-release': {
          version: '1.1',
          url: 'fake-new-url',
        },
        'older-release': {
          version: '0.1',
          url: 'fake-old-url',
        },
      }
      td.when(fakeBoshio.getLatestReleaseVersions(['newer-release', 'older-release']))
        .thenCallback(null, boshioVersions);

      var directorVersions = {
        'new': {
          version: '1.0',
        },
        'old': {
          version: '0.1',
        },
      }
      td.when(fakeRunner.getLatestReleaseVersions())
        .thenCallback(null, directorVersions);

      checker.upgradeableReleases(function(err, newReleases) {
        expect(err).to.be.null;
        expect(newReleases).to.eql([{
          name: 'new',
          version: '1.1',
          url: 'fake-new-url',
          displayName: 'new 1.1',
        }]);

        done();
      });
    });
  });
});
