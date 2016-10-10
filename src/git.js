var Git = require('nodegit');
var path = require('path');

function GitClient(workingDir) {
  this.workingDir = workingDir;
}

GitClient.prototype.clone = function(opts, cb) {
  var uri = opts.uri;
  var branch = opts.branch;

  var cloneOptions = new Git.CloneOptions();
  cloneOptions.checkoutBranch = branch;

  Git.Clone(uri, this.workingDir, cloneOptions).then(function(repo) {
    cb(new GitRepo(repo, this.branch));
  });
};

function GitRepo(backingRepo, branch) {
  this.backingRepo = backingRepo;
  this.branch = branch;
}
GitRepo.prototype.path = function() {
  // library returns path to .git dir
  return path.join(this.backingRepo.path(), '..');
};
GitRepo.prototype.pull = function(cb) {
  repo.fetchAll().then(function() {
    repo.mergeBranches(this.branch, `origin/${this.branch}`).then(function() {
      cb(null);
    });
  });
};


module.exports = GitClient;
