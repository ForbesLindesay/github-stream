# github-store

Use a github repository like the local file system it was always meant to be

[![Build Status](https://travis-ci.org/ForbesLindesay/github-store.png?branch=master)](https://travis-ci.org/ForbesLindesay/github-store)
[![Dependency Status](https://gemnasium.com/ForbesLindesay/github-store.png)](https://gemnasium.com/ForbesLindesay/github-store)
[![NPM version](https://badge.fury.io/js/github-store.png)](http://badge.fury.io/js/github-store)

## Installation

    npm install github-store

## API

To construct the store use:

```js
'use strict';

var GithubStore = require('github-store');

var store = new GithubStore(USER, REPO, GITHUB_TOKEN, options);

## License

  MIT