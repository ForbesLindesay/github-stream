# github-stream

Get a stream of updates to a GitHub repository.

[![Build Status](https://travis-ci.org/ForbesLindesay/github-stream.png?branch=master)](https://travis-ci.org/ForbesLindesay/github-stream)
[![Dependency Status](https://gemnasium.com/ForbesLindesay/github-stream.png)](https://gemnasium.com/ForbesLindesay/github-stream)
[![NPM version](https://badge.fury.io/js/github-stream.png)](http://badge.fury.io/js/github-stream)

## Installation

    npm install github-stream

## API

To construct the stream use:

```js
'use strict';

var Repository = require('github-stream');

var stream = new Repository(USER, REPO, GITHUB_TOKEN, options);

stream.on('data', function (update) {
  console.dir(update);
  // { type: 'Directory', action: 'Create', path: '/my-dir' }
  // { type: 'Directory', action: 'Delete', path: '/my-old-dir' }
  // { type: 'File', action: 'Create', path: '/my-new-file', body: Buffer}
  // { type: 'File', action: 'Update', path: '/my-file', body: Buffer}
  // { type: 'File', action: 'Delete', path: '/my-old-file'}
});
```

In order to keep track of updates, this module keeps the sha hashes of each file in memory. By default it polls github once per second, but it correctly handles caching such that the requests only count when there are updates to retrieve.

Note also that each file is transferred wholesale as a Buffer, not as a stream. This is much more convenient but can add significant memory footprint.

## License

  MIT
