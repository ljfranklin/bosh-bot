var spawnSync = require('child_process').spawnSync;
var spawn = require('child_process').spawn; var exec = require('child_process').exec;
var fs = require('fs');
var Readable = require('stream').Readable;
var yaml = require('js-yaml');
var async = require('async');
var S3 = require('./s3');

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

  if (config.ca_cert) {
    boshEnv.BOSH_CA_CERT = config.ca_cert;
  }

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

  runner.getLatestStemcellVersions = function(cb) {
    console.log('Checking for Director stemcell versions...');
    exec('bosh stemcells --json', { cwd: runner.cwd, env: boshEnv }, function(err, stdout, stderr) {
      if (err) {
        cb(new Error(`Error retrieving stemcells from Director: ${err}.\nSTDOUT: ${stdout}\nSTDERR: ${stderr}`), {});
        return;
      }

      var cmdOutput = yaml.safeLoad(stdout);
      if (cmdOutput.Tables == null || cmdOutput.length == 0) {
        cb(new Error(`Expected key 'Tables' in stemcells output, but didn't find it: ${stdout}`), {});
        return;
      }

      var results = cmdOutput.Tables[0].Rows;
      var stemcells = {};
      results.forEach(function(tuple) {
        // assumes first element has the highest version
        var name = tuple[0];
        var version = tuple[1].replace('*', ''); // remove 'in-use' indicator
        if (!stemcells.hasOwnProperty(name))  {
          console.log(`Director has version '${version}' of '${name}'`);
          stemcells[name] = {
            version: version,
          };
        }
      });

      cb(null, stemcells);
    });
  };

  runner.uploadStemcell = function(url, cb) {
    console.log(`Uploading stemcell '${url}' to Director...`);
    exec(`bosh -n upload-stemcell ${url}`, { cwd: runner.cwd, env: boshEnv }, function(err, _, stderr) {
      if (err) {
        cb(new Error(`Error uploading stemcell: ${err}. ${stderr}`));
        return;
      }

      console.log(`Successfully uploaded stemcell '${url}' to Director!`);
      cb(null);
    });
  };

  runner.uploadStemcells = function(stemcellURLs, cb) {
    var uploadFuncs = [];
    stemcellURLs.forEach(function(url) {
      uploadFuncs.push(function(cb) {
        runner.uploadStemcell(url, cb);
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
      vars_files,
      ops_files,
      vars_store,
    } = opts;

    var stdin = new Readable();

    var setupCbs = [];
    var cleanupCbs = [];
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
    if (vars_files) {
      Object.keys(vars_files).forEach(function(key) {
        boshCmd += ` --vars-file '${key}=${vars_files[key]}'`
      });
    }
    if (ops_files) {
      Object.keys(ops_files).forEach(function(key) {
        boshCmd += ` --ops-file '${key}=${ops_files[key]}'`
      });
    }
    if (vars_store) {
      // TODO: random tmp dir
      var varsStorePath = `/tmp/vars-store-${name}`;
      boshCmd += ` --vars-store ${varsStorePath}`;

      setupCbs.push(function(cb) {
        downloadVarsStore(vars_store, varsStorePath, cb);
      });
      cleanupCbs.push(function(cb) {
        fs.unlink(varsStorePath, function(_) {
          cb(null);
        });
      });
    }
    boshCmd += ` ${manifest_path}`;

    var runCmd = function(nestedCb) {
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
        console.log(out.toString());
        stdout += out.toString();
      });
      boshProcess.stderr.on('data', function(out) {
        console.log(out.toString());
        stderr += out.toString();
      });

      var processErr;
      boshProcess.on('error', function(err) {
        console.log(err);
        processErr = err;
      });
      boshProcess.on('close', function() {
        if (processErr) {
					nestedCb(processErr, filterOutput(stdout), stderr);
          return;
        }

        var diffSucceeded = stdout.match(diffPrompt);
        if (diffSucceeded) {
          nestedCb(null, filterOutput(stdout), stderr);
        } else {
          var err = new Error(`Failed to run 'bosh diff'. STDOUT: ${stdout}\nSTDERR: ${stderr}`);
          nestedCb(err, stdout, stderr);
        }
      });
    };

    async.parallel(setupCbs, function(err, _) {
      if (err) {
        cb(err, null, null);
        return;
      }

      runCmd(function(runErr, stdout, stderr) {
        async.parallel(cleanupCbs, function(cleanupErr) {
          if (runErr) {
            cb(runErr, null, null);
            return;
          }
          cb(cleanupErr, stdout, stderr);
        });
      });
    });
  };

  runner.deploy = function(opts, taskStartCb, taskEndedCb) {
    var {
      name,
      manifest_path,
      vars,
      var_files,
      vars_files,
      ops_files,
      vars_store,
    } = opts;

    var setupCbs = [];
    var cleanupCbs = [];
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
    if (vars_files) {
      Object.keys(vars_files).forEach(function(key) {
        boshCmd += ` --vars-file '${key}=${vars_files[key]}'`
      });
    }
    if (ops_files) {
      Object.keys(ops_files).forEach(function(key) {
        boshCmd += ` --ops-file '${key}=${ops_files[key]}'`
      });
    }
    if (vars_store) {
      // TODO: random tmp dir
      var varsStorePath = `/tmp/vars-store-${name}`;
      boshCmd += ` --vars-store ${varsStorePath}`;

      setupCbs.push(function(cb) {
        downloadVarsStore(vars_store, varsStorePath, cb);
      });
      cleanupCbs.push(function(cb) {
        uploadVarsStore(vars_store, varsStorePath, function(err) {
          fs.unlink(varsStorePath, function(_) {
            cb(err);
          });
        });
      });
    }
    boshCmd += ` ${manifest_path}`;

    var runCmd = function(nestedCb) {
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
        nestedCb(err);
      });
      boshProcess.on('close', function(exitCode) {
        if (exitCode == 0) {
          nestedCb(null);
        } else {
          nestedCb(new Error(boshOutput));
        }
      });
    };

    async.parallel(setupCbs, function(err, _) {
      if (err) {
        taskEndedCb(err);
        return;
      }

      runCmd(function(runErr) {
        async.parallel(cleanupCbs, function(cleanupErr) {
          var shouldRedact;
          var err;
          if (err && cleanupErr) {
            err = new Error(`Bosh err: ${runErr}, Cleanup Err: ${cleanupErr}`);
            shouldRedact = true;
          } else if (runErr) {
            err = runErr;
            shouldRedact = true;
          } else {
            err = cleanupErr
            shouldRedact = false;
          }

          taskEndedCb(err, shouldRedact);
        });
      });
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

  function downloadVarsStore(config, localPath, cb) {
    var client = S3.createClient({
      accessKey: config.access_key,
      secretKey: config.secret_key,
      endpoint:  config.endpoint,
      region:    config.region,
    });

    var downloadParams = {
      bucket:    config.bucket,
      key:       config.key,
      localPath: localPath,
    };
    client.download(downloadParams, function(err) {
      if (err && err instanceof S3.NotFoundError) {
        fs.writeFile(localPath, '', { mode: 0o600 }, cb);
      } else {
        cb(err);
      }
    });
  }

  function uploadVarsStore(config, localPath, cb) {
    var client = S3.createClient({
      accessKey: config.access_key,
      secretKey: config.secret_key,
      endpoint:  config.endpoint,
      region:    config.region,
    });

    var uploadParams = {
      bucket:    config.bucket,
      key:       config.key,
      localPath: localPath,
    };
    client.upload(uploadParams, cb);
  }

  return runner;
}

module.exports = BoshRunner;
