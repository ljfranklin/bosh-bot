var expect = require('chai').expect;
var td = require('testdouble');
var BoshioClient = require('../src/boshio_client');

describe('BoshioClient', function() {
  var client;

  var testTimeout = 5000;

  beforeEach(function() {
    client = BoshioClient();
  });

  afterEach(function(){
    td.reset();
  });

  describe('#releases', function(){
    it('retrieves the given release versions from boshio', function(done) {
      this.timeout(testTimeout);
      var id = 'github.com/concourse/concourse';
      client.getLatestReleaseVersions([id], function(err, results) {
        expect(err).to.be.null;
        expect(results).have.all.keys(id);

        var result = results[id];
        expect(result.name).to.eql(id);
        expect(result.version).to.match(/\d+\.\d+\.\d+.*/);
        expect(result.url).to.include('https');
        done();
      });
    });
  });

  describe('#stemcells', function(){
    it('retrieves the given light stemcell versions from boshio', function(done) {
      this.timeout(testTimeout);
      var id = 'bosh-aws-xen-hvm-ubuntu-trusty-go_agent';
      client.getLatestStemcellVersions([id], function(err, results) {
        expect(err).to.be.null;

        var result = results[id];
        expect(result.name).to.eql(id);
        expect(result.version).to.match(/\d+\..*/);
        expect(result.url).to.include('https');
        done();
      });
    });

    it('retrieves the given regular stemcell versions from boshio', function(done) {
      this.timeout(testTimeout);
      var id = 'bosh-openstack-kvm-ubuntu-trusty-go_agent';
      client.getLatestStemcellVersions([id], function(err, results) {
        expect(err).to.be.null;

        var result = results[id];
        expect(result.name).to.eql(id);
        expect(result.version).to.match(/\d+\..*/);
        expect(result.url).to.include('https');
        done();
      });
    });

    it('returns an error if invalid stemcell is given', function(done) {
      this.timeout(testTimeout);
      var id = 'fake-stemcell-name';
      client.getLatestStemcellVersions([id], function(err, _) {
        expect(err).to.not.be.null;
        expect(err.message).to.contain('fake-stemcell-name');
        done();
      });
    });
  });
});
