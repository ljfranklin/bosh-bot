var expect = require('chai').expect;
var fs = require('fs');
const crypto = require('crypto');
var AWS = require('aws-sdk');

var S3 = require('../src/s3');

describe('S3', function() {
  var client;
  var s3Helper;
  var objectBucket;

  beforeEach(function() {
    objectBucket = process.env.BOSH_BOT_S3_BUCKET;
    var accessKey = process.env.BOSH_BOT_S3_ACCESS_KEY;
    var secretKey = process.env.BOSH_BOT_S3_SECRET_KEY;
    var endpoint = process.env.BOSH_BOT_S3_ENDPOINT || 's3.amazonaws.com';

    if (!objectBucket) {
      throw new Error('Missing required env variable BOSH_BOT_S3_BUCKET');
    }
    if (!accessKey) {
      throw new Error('Missing required env variable BOSH_BOT_S3_ACCESS_KEY');
    }
    if (!secretKey) {
      throw new Error('Missing required env variable BOSH_BOT_S3_SECRET_KEY');
    }

    localPath = `/tmp/${randomString()}`;

    client = S3.createClient({
      accessKey: accessKey,
      secretKey: secretKey,
      endpoint:  endpoint,
    });

    s3Helper = new AWS.S3({
      accessKeyId:     accessKey,
      secretAccessKey: secretKey,
      endpoint:        endpoint,
    });
  });

  afterEach(function() {
    try { fs.unlinkSync(localPath); } catch(_) {}
  });

  describe('#upload', function() {
    var key;

    beforeEach(function() {
      key = randomString();

      fs.writeFileSync(localPath, 'BOSH BOT!');
    });

    afterEach(function(done) {
      fs.unlinkSync(localPath);
      var params = {
        Bucket: objectBucket,
        Key: key,
      };
      s3Helper.deleteObject(params, done);
    });

    it('uploads the file to S3', function(done) {
      this.timeout(5000);

      var uploadParams = {
        bucket:    objectBucket,
        key:       key,
        localPath: localPath,
      };
      client.upload(uploadParams, function(err) {
        expect(err).to.be.null;

        var params = {
          Bucket: objectBucket,
          Key: key,
        };
        s3Helper.getObject(params, function(err, data) {
          expect(err).to.be.null;
          expect(data.Body.toString()).to.eql('BOSH BOT!');
          done();
        });
      });
    });
  });

  describe('#download', function() {

    context('when the file exists on S3', function() {
      var key;

      beforeEach(function(done) {
        key = randomString();

        var params = {
          Bucket: objectBucket,
          Key: key,
          Body: 'BOSH BOT!',
        };
        s3Helper.putObject(params, function(err, _) {
          expect(err).to.be.null;
          done();
        });
      });

      afterEach(function(done) {
        var params = {
          Bucket: objectBucket,
          Key: key,
        };
        s3Helper.deleteObject(params, done);
      });

      it('fetches an existing file from S3', function(done) {
        this.timeout(5000);

        var downloadParams = {
          bucket:    objectBucket,
          key:       key,
          localPath: localPath,
        };
        client.download(downloadParams, function(err) {
          expect(err).to.be.null;
          var contents = fs.readFileSync(localPath, 'utf8');
          expect(contents).to.eql('BOSH BOT!');
          done();
        });
      });
    });

    context('when the file does not exist', function() {
      it('returns a 404 error if file does not exist', function(done) {
        this.timeout(5000);

        var downloadParams = {
          bucket:    objectBucket,
          key:       'non-existant-key',
          localPath: localPath,
        };
        client.download(downloadParams, function(err) {
          expect(err).to.be.an.instanceof(S3.NotFoundError);
          expect(err.message).to.include('non-existant-key');
          expect(err.message).to.include(objectBucket);
          done();
        });
      });
    });
  });

  function randomString() {
    return crypto.randomBytes(16).toString('hex');
  }
});
