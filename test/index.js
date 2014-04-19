'use strict';

var assert = require('assert');
var test = require('testit');
var pr = require('pull-request');
var Queue = require('./queue');
var Repository = require('../');

var GITHUB_TOKEN = '90993e4e47b0fdd1f51f4c67b17368c62a3d6097';
var USER = 'github-basic-js-test';
var REPO = 'github-store-test-2';


var queue = new Queue();
var repo = new Repository(USER, REPO, GITHUB_TOKEN, {update: '100ms'});

repo.on('data', function (file) {
  console.dir(file);
  queue.push(file);
});
repo.on('error', function (err) {
  throw err;
});

test('it notifies you of each of the files already in the repository', function () {
  return queue.pop().then(function (item) {
    assert.deepEqual(item, { type: 'Directory', action: 'Create', path: '/', body: null });
    return queue.pop();
  }).then(function (item) {
    assert(item.type === 'File');
    assert(item.action === 'Create');
    assert(item.path === '/README.md');
    assert(item.body);
    return queue.pop();
  }).then(function (item) {
    assert(item.type === 'File');
    assert(item.action === 'Create');
    assert(item.path === '/test.txt');
    assert(item.body);
  })
});
test('it can stream updates', function () {
  var content = (new Date()).toISOString();
  pr.commit(USER, REPO, {
    branch: 'master',
    message: 'Update test.txt',
    updates: [{path: 'test.txt', content: content}]
  }, {
    auth: {
      type: 'oauth',
      token: GITHUB_TOKEN
    }
  }).done();
  return queue.pop().then(function (item) {
    assert(item.type === 'File');
    assert(item.action === 'Update');
    assert(item.path === '/test.txt');
    assert(item.body.toString() === content);
    assert(queue.length === 0);
  });
});

