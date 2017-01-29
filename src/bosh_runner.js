var spawnSync = require('child_process').spawnSync;
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var Readable = require('stream').Readable;
var yaml = require('js-yaml');
var async = require('async');

function BoshRunner(config = {}) {
  var runner = {
    cwd: config.cwd,
  };

  var boshEnv = {
    BOSH_ENVIRONMENT:   config.env,
    BOSH_CLIENT:        config.user,
    BOSH_CLIENT_SECRET: config.password,
    PATH:               process.env.PATH,
    HOME:               process.env.HOME,
  };

  var diffPrompt = 'Continue?.*'
  var patternsToRemoveFromOutput = [
    'Using environment .*',
    'Using deployment .*',
    diffPrompt,
  ];

  runner.precheck = function() {
    if (spawnSync('which', ['bosh']).status != 0) {
      throw new Error('Error: Cannot find executate `bosh` in PATH. Grab the CLI from here: https://github.com/cloudfoundry/bosh-cli.');
    }
  };

  runner.getLatestReleaseVersions = function(cb) {
    console.log('Checking for Director release versions...');
    exec('bosh releases --json', { cwd: runner.cwd, env: boshEnv }, function(err, stdout, stderr) {
      if (err) {
        cb(new Error(`Error retrieving releases from Director: ${err}.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`), {});
        return;
      }

      var cmdOutput = yaml.safeLoad(stdout);
      if (cmdOutput.Tables == null || cmdOutput.length == 0) {
        cb(new Error(`Expected key 'Tables' in releases output, but didn't find it: ${stdout}`), {});
        return;
      }

      var releaseTuples = cmdOutput.Tables[0].Rows;
      var releases = {};
      releaseTuples.forEach(function(tuple) {
        // assumes first element has the highest version
        var releaseName = tuple[0];
        var releaseVersion = tuple[1].replace('*', ''); // remove 'in-use' indicator
        if (!releases.hasOwnProperty(releaseName))  {
          console.log(`Director has version '${releaseVersion}' of '${releaseName}'`);
          releases[releaseName] = {
            version: releaseVersion,
          };
        }
      });

      cb(null, releases);
    });
  };

  runner.uploadRelease = function(url, cb) {
    console.log(`Uploading release '${url}' to Director...`);
    exec(`bosh -n upload-release ${url}`, { cwd: runner.cwd, env: boshEnv }, function(err, _, stderr) {
      if (err) {
        cb(new Error(`Error uploading release: ${err}. ${stderr}`));
        return;
      }

      console.log(`Successfully uploaded release '${url}' to Director!`);
      cb(null);
    });
  };

  runner.uploadReleases = function(releasesURLs, cb) {
    var uploadFuncs = [];
    releasesURLs.forEach(function(url) {
      uploadFuncs.push(function(cb) {
        runner.uploadRelease(url, cb);
      });
    });
    async.parallel(uploadFuncs, function(err) {
      cb(err)
    });
  };

  runner.showDiff = function(opts, cb) {
    var {
      name,
      manifest_path,
      vars,
      var_files,
    } = opts;

    var stdin = new Readable();

    var boshCmd = `bosh --no-color --tty deploy -d '${name}'`;
    if (vars) {
      Object.keys(vars).forEach(function(key) {
        boshCmd += ` -v '${key}=${JSON.stringify(vars[key])}'`
      });
    }
    if (var_files) {
      Object.keys(var_files).forEach(function(key) {
        boshCmd += ` --var-file '${key}=${var_files[key]}'`
      });
    }

    boshCmd += ` ${manifest_path}`;
    var boshProcess = spawn('bash', ['-c', boshCmd], {
      cwd: runner.cwd,
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
    boshProcess.on('close', function(err) {
      var diffSucceeded = stdout.match(diffPrompt);
      if (diffSucceeded) {
        cb(null, filterOutput(stdout), stderr);
      } else {
        var err = new Error(`Failed to run 'bosh diff'. STDOUT: ${stdout}\nSTDERR: ${stderr}`);
        cb(err, stdout, stderr);
      }
    });
  };

  runner.deploy = function(opts, taskStartCb, taskEndedCb) {
    var {
      name,
      manifest_path,
      vars,
      var_files,
    } = opts;

    var boshCmd = `bosh -n --no-color --tty deploy -d '${name}'`;
    if (vars) {
      Object.keys(vars).forEach(function(key) {
        boshCmd += ` -v '${key}=${JSON.stringify(vars[key])}'`
      });
    }
    if (var_files) {
      Object.keys(var_files).forEach(function(key) {
        boshCmd += ` --var-file '${key}=${var_files[key]}'`
      });
    }

    boshCmd += ` ${manifest_path}`;
    var boshProcess = spawn('bash', ['-c', boshCmd], {
      cwd: runner.cwd,
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
    exec(`bosh cancel-task ${taskID}`, { cwd: runner.cwd, env: boshEnv }, function(err, stdout, stderr) {
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
