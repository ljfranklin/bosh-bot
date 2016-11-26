var spawnSync = require('child_process').spawnSync;
var spawn = require('child_process').spawn;
var Readable = require('stream').Readable;

function BoshRunner(config) {
  var runner = {};

  var boshEnv = {
    // BOSH_ENVIRONMENT: config.env,
    // BOSH_USER:        config.user,
    // BOSH_PASSWORD:    config.password,
    PATH:             process.env.PATH,
  };

  runner.precheck = function() {
    if (spawnSync('which', ['bosh']).status != 0) {
      throw new Error('Error: Cannot find executate `bosh` in PATH. Grab the CLI from here: https://github.com/cloudfoundry/bosh-cli.');
    }
  };

  runner.showDiff = function(opts, cb) {
    var {
      name,
      manifest,
    } = opts;

    var stdin = new Readable();
    // s._read = function noop() {}; // redundant? see update below
    stdin.push('no');
    stdin.push(null);

    var boshProcess = spawn('bosh', ['--no-color', '--tty', 'deploy', '-d', name, manifest], {
      env: boshEnv,
      timeout: 20000,
      stdin: stdin,
    });

    var stdout = '';
    var stderr = '';
    boshProcess.stdout.on('data', function(out) {
      stdout += out;
    });
    boshProcess.stderr.on('data', function(out) {
      stderr += out;
    });

    boshProcess.on('error', function(err) {
      cb(err, stdout, stderr);
    });
    boshProcess.on('close', function(_) {
      cb(null, stdout.replace('Continue? [yN]:', ''), stderr);
    });
  };

  runner.deploy = function(opts, taskStartCb, taskEndedCb) {
    var {
      name,
      manifest,
    } = opts;

    var boshProcess = spawn('bosh', ['-n', '--no-color', '--tty', 'deploy', '-d', name, manifest], {
      env: boshEnv,
    });

    var taskNumber = null;
    boshProcess.stdout.on('data', function(out) {
      matches = out.match(/Task ([0-9]+)/i)
      if (taskNumber == null && matches) {
        taskNumber = matches[1];
        var cancelCb = function() {
            boshProcess.kill('SIGINT');
        };
        taskStartCb(taskNumber, cancelCb);
      }
    });
    boshProcess.stderr.on('data', function(out) {

    });

    boshProcess.on('error', function(err) {
      taskEndedCb(err);
    });
    boshProcess.on('close', function(exitCode) {
      if (exitCode == 0) {
        taskEndedCb(null);
      } else {
        taskEndedCb(new Error(`Deploy failed with exit code ${exitCode}`));
      }
    });
  };

  return runner;
}

module.exports = BoshRunner;
