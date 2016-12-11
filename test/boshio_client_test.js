var expect = require('chai').expect;
var td = require('testdouble');
var BoshioClient = require('../src/boshio_client');

describe('BoshioClient', function() {
  var client;

  beforeEach(function() {
    client = BoshioClient();
  });

  afterEach(function(){
    td.reset();
  });

  describe('#releases', function(){
    it('retrieves the given release versions from boshio', function(done) {
      client.getLatestReleaseVersions(['github.com/concourse/concourse'], function(_, result) {
        expect(result.name).to.eql('github.com/concourse/concourse');
        expect(result.version).to.match(/\d+\.\d+\.\d+.*/);
        expect(result.url).to.include('https');
        done();
      });
    });
  });
});
