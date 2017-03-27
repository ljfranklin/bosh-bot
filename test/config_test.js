var expect = require('chai').expect;
var uuid = require('node-uuid');
var path = require('path');
var fs = require('fs');
var os = require('os');
var yaml = require('js-yaml');

var Config = require('../src/config.js');

describe('BoshBot', function() {

  var configHash;
  var config;
  var configPath;

  var validConfig = {
    slack: {
      token: 'fake-token',
      authorizedUsernames: ['fake-user'],
    },
    bosh: {
      env: 'fake-env',
      user: 'fake-user',
      password: 'fake-password',
    },
  };

  beforeEach(function() {
    configPath = path.join(os.tmpdir(), `bosh-config-${uuid.v4()}.yml`);
  });

  afterEach(function() {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
  });

  describe('#loadSync', function() {
    it('returns nil when config is valid', function() {
      writeConfig(validConfig);
      config = Config(configPath);

      expect(config.loadSync()).to.be.null;
    });

    it('returns an error if an invalid config path is given', function() {
      config = Config('my-fake-path');

      err = config.loadSync();
      expect(err).to.be.an('error');
      expect(err.message).to.include('my-fake-path');
    });

    it('returns an error if a required property is omitted', function() {
      writeConfig({});
      config = Config(configPath);

      err = config.loadSync();
      expect(err).to.be.an('error');
      expect(err.message).to.include('slack.token');
      expect(err.message).to.include('slack.authorized_usernames');
      expect(err.message).to.include('bosh.env');
      expect(err.message).to.include('bosh.user');
      expect(err.message).to.include('bosh.password');
    });
  });

  describe('#get', function() {
    var config;

    beforeEach(function() {
      writeConfig(validConfig);

      config = Config(configPath);
      config.loadSync();
    });

    it('returns nested properties', function() {
      expect(config.get('slack.token')).to.eq('fake-token');
    });

    it('returns default values if no value is provided', function() {
      expect(config.get('bosh.releases')).to.eql([]);
      expect(config.get('bosh.stemcells')).to.eql([]);
      expect(config.get('bosh.deployments')).to.eql([]);
      expect(config.get('bosh.assets')).to.eql([]);
    });
  });

  function writeConfig(config) {
    fs.writeFileSync(configPath, yaml.safeDump(config));
  }
});
