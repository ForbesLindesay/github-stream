# github-stream

Get a stream of updates to a GitHub repository.

[![Build Status](https://img.shields.io/travis/ForbesLindesay/github-stream/master.svg)](https://travis-ci.org/ForbesLindesay/github-stream)
[![Dependency Status](https://img.shields.io/gemnasium/ForbesLindesay/github-stream.svg)](https://gemnasium.com/ForbesLindesay/github-stream)
[![NPM version](https://img.shields.io/npm/v/github-stream.svg)](http://badge.fury.io/js/github-stream)

## Installation

    npm install github-stream

## API

To construct the stream use:

```js
'use strict';

var Repository = require('github-stream');

var stream = new Repository(USER, REPO, options);

stream.on('data', function (update) {
  console.dir(update);
  // { type: 'Directory', action: 'Create', path: '/my-dir' }
  // { type: 'Directory', action: 'Delete', path: '/my-old-dir' }
  // { type: 'File', action: 'Create', path: '/my-new-file', body: Buffer}
  // { type: 'File', action: 'Update', path: '/my-file', body: Buffer}
  // { type: 'File', action: 'Delete', path: '/my-old-file'}
});
```

In order to keep track of updates, this module keeps the sha hashes of each file in memory. By default it polls github once every 10 seconds, but it correctly handles caching such that the requests only count when there are updates.

Note also that each file is transferred wholesale as a Buffer, not as a stream. This is much more convenient but can add significant memory footprint.

### Options

 - `branch` - The github branch to fetch, defaults to `'master'`
 - `auth` - Optional access token to make requests with
 - `updateFrequency` - time to wait between polling (passed to the ms module, so it can be a string like `'10s'`), defaults to`'10s'`
 - `retryFrequency` - time to wait if the previus poll resulted in an error, defaults to the `updateFrequency`
 - `state` - the previous state of the repository, you can use this to optimise server restarts

### Events

In addition to the usual stream events, it also supports the following events:

 - `'state-updated'` - emitted whenever the internal cache state has been properly updated.  You can use this to persist between restarts.
 - `'error'` - this is emitted whenever something goes wrong, but the polling continues even if there is an error.

### Methods

 - `stream.waitUntilReady()` - returns a promise that is resolved once the repo has been fully synced
 - `stream.dispose()` - stop listening for updates

## License

  MIT
