var expect = require('chai').expect
var td = require('testdouble')

var BoshRunner = require('../../src/bosh_runner')
var BoshioClient = require('../../src/boshio_client')
var UpgradeChecker = require('../../src/upgrade/checker')

describe('UpgradeChecker', function () {
  var fakeRunner
  var fakeBoshio
  var checker

  beforeEach(function () {
    fakeRunner = td.object(BoshRunner())
    fakeBoshio = td.object(BoshioClient())

    checker = UpgradeChecker({
      boshRunner: fakeRunner,
      boshioClient: fakeBoshio,
      stemcells: [
        {
          boshio_id: 'newer-stemcell'
        },
        {
          boshio_id: 'older-stemcell'
        },
        {
          boshio_id: 'non-semver-stemcell'
        }
      ],
      releases: [
        {
          name: 'new',
          boshio_id: 'newer-release'
        },
        {
          name: 'old',
          boshio_id: 'older-release'
        }
      ]
    })
  })

  describe('#upgradeableStemcells', function () {
    it('returns stemcells that have a higher version on boshio than director', function (done) {
      var boshioVersions = {
        'newer-stemcell': {
          name: 'newer-stemcell',
          version: '1.1',
          url: 'fake-new-url'
        },
        'older-stemcell': {
          name: 'older-stemcell',
          version: '0.1',
          url: 'fake-old-url'
        },
        'non-semver-stemcell': {
          name: 'non-semver-stemcell',
          version: '1',
          url: 'fake-non-semver-url'
        }
      }
      td.when(fakeBoshio.getLatestStemcellVersions(['newer-stemcell', 'older-stemcell', 'non-semver-stemcell']))
        .thenCallback(null, boshioVersions)

      var directorVersions = {
        'newer-stemcell': {
          version: '1.0'
        },
        'older-stemcell': {
          version: '0.1'
        }
      }
      td.when(fakeRunner.getLatestStemcellVersions())
        .thenCallback(null, directorVersions)

      checker.upgradeableStemcells(function (err, newStemcells) {
        expect(err).to.be.null
        expect(newStemcells).to.eql([{
          name: 'newer-stemcell',
          version: '1.1',
          url: 'fake-new-url',
          displayName: 'newer-stemcell 1.1',
          boshioID: 'newer-stemcell'
        }, {
          name: 'non-semver-stemcell',
          version: '1',
          url: 'fake-non-semver-url',
          displayName: 'non-semver-stemcell 1',
          boshioID: 'non-semver-stemcell'
        }])

        done()
      })
    })
  })

  describe('#upgradeableReleases', function () {
    it('returns releases that have a higher version on boshio than director', function (done) {
      var boshioVersions = {
        'newer-release': {
          version: '1.1',
          url: 'fake-new-url'
        },
        'older-release': {
          version: '0.1',
          url: 'fake-old-url'
        }
      }
      td.when(fakeBoshio.getLatestReleaseVersions(['newer-release', 'older-release']))
        .thenCallback(null, boshioVersions)

      var directorVersions = {
        'new': {
          version: '1.0'
        },
        'old': {
          version: '0.1'
        }
      }
      td.when(fakeRunner.getLatestReleaseVersions())
        .thenCallback(null, directorVersions)

      checker.upgradeableReleases(function (err, newReleases) {
        expect(err).to.be.null
        expect(newReleases).to.eql([{
          name: 'new',
          version: '1.1',
          url: 'fake-new-url',
          displayName: 'new 1.1',
          boshioID: 'newer-release'
        }])

        done()
      })
    })

    it('embeds the release notes link if that page exists', function (done) {
      this.timeout(10000)

      checker = UpgradeChecker({
        boshRunner: fakeRunner,
        boshioClient: fakeBoshio,
        stemcells: [],
        releases: [
          {
            name: 'concourse',
            boshio_id: 'github.com/concourse/concourse'
          }
        ]
      })

      var boshioVersions = {
        'github.com/concourse/concourse': {
          version: '2.5.0',
          url: 'https://bosh.io/d/github.com/concourse/concourse?v=2.5.0'
        }
      }
      td.when(fakeBoshio.getLatestReleaseVersions(['github.com/concourse/concourse']))
        .thenCallback(null, boshioVersions)

      var directorVersions = {}
      td.when(fakeRunner.getLatestReleaseVersions())
        .thenCallback(null, directorVersions)

      checker.upgradeableReleases(function (err, newReleases) {
        expect(err).to.be.null
        expect(newReleases).to.eql([{
          name: 'concourse',
          version: '2.5.0',
          url: 'https://bosh.io/d/github.com/concourse/concourse?v=2.5.0',
          displayName: '<https://github.com/concourse/concourse/releases/tag/v2.5.0|concourse 2.5.0>',
          boshioID: 'github.com/concourse/concourse'
        }])

        done()
      })
    })
  })
})
