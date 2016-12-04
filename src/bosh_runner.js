var spawnSync = require('child_process').spawnSync;
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var Readable = require('stream').Readable;

function BoshRunner(config = {}) {
  var runner = {};

  var boshEnv = {
    BOSH_ENVIRONMENT: config.env,
    BOSH_USER:        config.user,
    BOSH_PASSWORD:    config.password,
    PATH:             process.env.PATH,
  };

  var patternsToRemoveFromOutput = [
    'Using environment .*',
    'Using deployment .*',
    'Continue?.*',
  ];

  runner.precheck = function() {
    if (spawnSync('which', ['bosh']).status != 0) {
      throw new Error('Error: Cannot find executate `bosh` in PATH. Grab the CLI from here: https://github.com/cloudfoundry/bosh-cli.');
    }
  };

  runner.showDiff = function(opts, cb) {
    var {
      name,
      manifest_path,
      vars_file_contents,
    } = opts;

    var stdin = new Readable();

    var boshCmd = `bosh --no-color --tty deploy -d '${name}'`;
    if (vars_file_contents) {
      boshCmd += ` -l <(echo '${vars_file_contents}')`
    }
    boshCmd += ` ${manifest_path}`;
    var boshProcess = spawn('bash', ['-c', boshCmd], {
      env: boshEnv,
      timeout: 20000,
      stdin: stdin,
    });

    boshProcess.stdin.write('no');
    boshProcess.stdin.end();

    var stdout = '';
    var stderr = '';
    boshProcess.stdout.on('data', function(out) {
      stdout += out.toString();
    });
    boshProcess.stderr.on('data', function(out) {
      stderr += out.toString();
    });

    boshProcess.on('error', function(err) {
      cb(err, filterOutput(stdout), stderr);
    });
    boshProcess.on('close', function(_) {
      cb(null, filterOutput(stdout), stderr);
    });
  };

  runner.deploy = function(opts, taskStartCb, taskEndedCb) {
    var {
      name,
      manifest_path,
      vars_file_contents,
    } = opts;

    var boshCmd = `bosh -n --no-color --tty deploy -d '${name}'`;
    if (vars_file_contents) {
      boshCmd += ` -l <(echo '${vars_file_contents}')`
    }
    boshCmd += ` ${manifest_path}`;
    var boshProcess = spawn('bash', ['-c', boshCmd], {
      env: boshEnv,
    });

    var taskNumber = null;
    var boshOutput = '';
    boshProcess.stdout.on('data', function(out) {
      boshOutput += out.toString();

      matches = out.toString().match(/Task ([0-9]+)/i)
      if (taskNumber == null && matches) {
        taskNumber = matches[1];
        var cancelCb = function() {
          cancelTask(taskNumber);
        };
        taskStartCb(taskNumber, cancelCb);
      }
    });
    boshProcess.stderr.on('data', function(out) {
      boshOutput += out.toString();
    });

    boshProcess.on('error', function(err) {
      taskEndedCb(err);
    });
    boshProcess.on('close', function(exitCode) {
      if (exitCode == 0) {
        taskEndedCb(null);
      } else {
        taskEndedCb(new Error(boshOutput));
      }
    });
  };

  function cancelTask(taskID) {
    exec(`bosh cancel-task ${taskID}`, { env: boshEnv }, function(err, stdout, stderr) {
      if (err) {
        console.log(`Error canceling task ${taskID}: ${err}`);
      } else {
        console.log(`Successfully canceled task ${taskID}`);
      }
    });
  }

  function filterOutput(output) {
    patternsToRemoveFromOutput.forEach(function(pattern) {
      output = output.replace(new RegExp(`^${pattern}$`, 'mg'), '')
    });
    output = output.trim();
    if (output.length == 0) {
      output = 'No changes...';
    }
    return output;
  }

  return runner;
}

module.exports = BoshRunner;
