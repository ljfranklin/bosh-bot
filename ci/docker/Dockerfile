FROM node:7.8-alpine

RUN apk update && \
    apk --no-cache add \
    ca-certificates wget bash git openssh coreutils

# the BOSH CLI is dynamically linked against glibc
RUN wget -q -O /etc/apk/keys/sgerrand.rsa.pub https://raw.githubusercontent.com/sgerrand/alpine-pkg-glibc/master/sgerrand.rsa.pub && \
  wget -q -O /tmp/glibc.apk https://github.com/sgerrand/alpine-pkg-glibc/releases/download/2.25-r0/glibc-2.25-r0.apk && \
  apk add /tmp/glibc.apk && \
  rm -rf /tmp/glibc.apk

RUN npm install -g mocha

RUN wget -q -O /usr/local/bin/bosh 'https://s3.amazonaws.com/bosh-cli-artifacts/bosh-cli-2.0.16-linux-amd64' && \
  chmod +x /usr/local/bin/bosh
