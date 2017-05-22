# BOSH Bot

**Still in pre-release, almost done though!**

A Slack bot that does [BOSH](https://github.com/cloudfoundry/bosh) deploys.
Also he talks like an airline pilot, I call him Captain Bucky.

TODO: show some screenshots

## Why?

- Automatically keep your stemcells and releases up-to-date.
- Start deploys from your phone.
- It's delightful!

## What can it do?

- Can trigger deploys via a Slack message.
- Periodically checks [bosh.io](https://bosh.io) for new stemcells and releases and uploads them to your Director.
- Supports new BOSH CLI features like `--var` and `--ops-file`.
- Can fetch deployment assets (config files, SSH keys) from public and private git repos.
- Can store your `vars-store` file in an S3-compatible blobstore.
- Packaged as a BOSH releases, can be co-located on your Director VM.

## Why wouldn't I use this?

Mostly intended for hands-free updates like keeping your Concourse installation and stemcells up-to-date.
If you frequently change your deployment config or your deploys require manual intervention, this Bot may not be a good fit.

## Setup

Currently there are two supported ways of deploying this Bot: co-locate on your Director VM or BOSH deploy to a stand-alone VM.

#### Co-locate with Director

Pros:

- Doesn't require any additional VMs

Cons:

- You have to re-create your Director VM anytime you want to update the Bot config

If you're using [bosh-deployment](https://github.com/cloudfoundry/bosh-deployment) to deploy your Director, you only need to include an additional ops-file and vars-file:

```bash
bosh create-env ~/workspace/bosh-deployment/bosh.yml \
  --state ./state.json \
  --vars-store ./creds.yml \
  ... \
  -o ~/workspace/bosh-bot/bosh/bosh-ops-file.yml \
  -l ./bot-bot-vars.yml
```

Here's an example vars-file:

```yaml
bosh_bot_slack_authorized_channels:
- general
bosh_bot_slack_authorized_usernames:
- YOUR_SLACK_NAME
bosh_bot_slack_notification_channel:
- general
bosh_bot_slack_token:
- SLACK_BOT_API_TOKEN
bosh_hostname: bosh.example.com
bosh_bot_releases:
- name: concourse
  boshio_id: 'github.com/concourse/concourse'
- name: garden-runc
  boshio_id: 'github.com/cloudfoundry/garden-runc-release'
bosh_bot_stemcells:
- boshio_id: bosh-google-kvm-ubuntu-trusty-go_agent
bosh_bot_deployments:
- name: concourse
  manifest_path: 'deployments/concourse/concourse.yml'
  assets:
    - deployments
    - certs
  var_files:
    concourse_ssl_cert: 'certs/certificates/example.com.crt'
    concourse_ssl_key: 'certs/certificates/example.com.key'
  vars:
    github_client_id: EXAMPLE_ID
    github_client_secret: EXAMPLE_SECRET
  vars_store:
    endpoint: storage.googleapis.com # optional
    access_key: EXAMPLE_ACCESS_KEY
    secret_key: EXAMPLE_SECRET_KEY
    bucket: EXAMPLE_BUCKET
    key:    vars-store.yml
bosh_bot_assets:
- name: deployments
  type: 'git'
  uri: 'https://github.com/EXAMPLE/REPO.git'
- name: certs
  type: 'git'
  uri: 'ssh://git@github.com/EXAMPLE/PRIVATE_REPO.git'
  deploy_key: |
    YOUR_PRIVATE_SSH_KEY
```

#### Deploy to standalone VM

Pros:

- Faster to update your Bot config.

Cons:

- Requires an extra VM.

Deploy using the provided manifest:

```bash
bosh deploy ~/workspace/bosh-bot/bosh/bosh-manifest.yml \
  -d bosh-bot \
  -l ./bot-bot-vars.yml
```

The vars-file is the same format as above.
