var fs = require('fs');
var AWS = require('aws-sdk');

function NotFoundError(message) {
  Error.captureStackTrace(this, this.constructor);
  this.name = this.constructor.name;
  this.message = message;
}

function createClient(opts) {
  var client = {};

  var awsOpts = {
    accessKeyId:     opts.accessKey,
    secretAccessKey: opts.secretKey,
  };
  if (opts.region) {
    awsOpts.region = opts.region;
  }
  if (opts.endpoint) {
    awsOpts.endpoint = opts.endpoint;
  }

  var s3 = new AWS.S3(awsOpts);

  client.upload = function(params, cb) {
    if (!opts.endpoint && !opts.region) {
      cb(new Error('Must specify either S3 region or S3 endpoint.'));
      return;
    }

    var awsParams = {
      Bucket: params.bucket,
      Key: params.key,
      Body: fs.createReadStream(params.localPath),
    };
    s3.putObject(awsParams, function(err, _) {
      if (err) {
        cb(new Error(err.message));
        return;
      }
      cb(null);
    });
  };

  client.download = function(params, cb) {
    if (!opts.endpoint && !opts.region) {
      cb(new Error('Must specify either S3 region or S3 endpoint.'));
      return;
    }

    var awsParams = {
      Bucket: params.bucket,
      Key: params.key,
    };
    s3.getObject(awsParams, function(err, data) {
      if (err) {
        if (err.statusCode == 404) {
          cb(new NotFoundError(`The file ${params.key} does not exist in bucket ${params.bucket}.`));
          return;
        } else {
          cb(new Error(err.message));
          return;
        }
      }

      fs.writeFile(params.localPath, data.Body, { mode: 0o600 }, function(err) {
        if (err) {
          cb(err);
          return;
        } else {
          cb(null);
          return;
        }
      });
    });
  };

  return client;
}

module.exports = {
  createClient: createClient,
  NotFoundError: NotFoundError,
};
