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
});
