'use strict';

var GithubStore = require('../');

var GITHUB_TOKEN = '90993e4e47b0fdd1f51f4c67b17368c62a3d6097';
var USER = 'github-basic-js-test';
var REPO = 'github-store-test-2';

var pr = require('pull-request');/*
pr.commit(USER, REPO, {
  branch: 'master',
  message: 'Update test.txt',
  updates: [{path: 'test.txt', content: (new Date()).toISOString()}]
}, {
  auth: {
    type: 'oauth',
    token: GITHUB_TOKEN
  }
}).done();*/
//require('github-basic').json('POST', '/user/repos', {name: REPO, auto_init: true}, {
//  auth: {type: 'oauth', token: GITHUB_TOKEN}}).done();

var repo = new GithubStore(USER, REPO, {
  type: 'oauth',
  token: GITHUB_TOKEN
}, {
  update: '100ms',
  directory: __dirname + '/repo'
});
repo.on('data', function (file) {
  console.dir(file);
});
repo.on('error', function (err) {
  console.log(err.stack);
});
