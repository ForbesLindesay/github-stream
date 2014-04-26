'use strict';

var crypto = require('crypto');
var Transform = require('barrage').Transform;
var Readable = require('barrage').Readable;
var Promise = require('promise');
var ms = require('ms');

var CommitStream = require('./lib/commits.js');
var CurrentFilesStream = require('./lib/current-files.js');

module.exports = RepositoryStream;
function RepositoryStream(user, repo, auth, options) {
  Readable.call(this, {objectMode: true});
  
  options = options || {};
  this._user = user;
  this._repo = repo;
  this._branch = options.branch || 'master';
  this._auth = typeof auth === 'string' ? {type: 'oauth', token: auth} : auth;

  this._state = {};

  var updateFrequency = ms((options.updateFrequency || (this._auth ? '1s' : '60s')) + '');
  var retryFrequency = ms(options.retryFrequency || (updateFrequency + 'ms'));

  if (this._auth) {
    var commits = new CommitStream(this._user, this._repo, this._auth, options);
    var ready = Promise.from(null);
    commits.on('data', function (tag) {
      ready = ready.then(function () {
        return this.pushUpdates(new CurrentFilesStream(this._user, this._repo, this._auth, tag));
      }.bind(this)).then(null, function (err) {
        this.emit('error', err);
      }.bind(this));
      ready.done();
    }.bind(this));
  } else {
    var update = function () {
      this.pushUpdates(new CurrentFilesStream(
        this._user, this._repo, this._auth, this._branch)).done(function () {
        setTimeout(update, updateFrequency);
      }, function (err) {
        this.emit('error', err);
        setTimeout(update, retryFrequency);
      }.bind(this));
    }.bind(this);
    update();
  }
}
RepositoryStream.prototype = Object.create(Readable.prototype);
RepositoryStream.prototype.constructor = RepositoryStream;
RepositoryStream.prototype._read = function () {};


RepositoryStream.prototype.pushUpdates = function (files) {
  return new Promise(function (resolve, _reject) {
    var errored = false;
    function reject(err) {
      errored = true;
      _reject(err);
    }
    var oldState = this._state;
    var newState = this._state = {};
    files.on('data', function (node) {
      if (errored) return;
      var type = node.type;
      var path = node.path;
      var body = node.body || null;
      var hash = type === 'Directory' ? type : getHash(body);
      newState[path] = hash;
      if (oldState[path] === hash) return;
      if (oldState[path] === 'Directory' && type === 'File') {
        this.push({type: 'Directory', action: 'Delete', path: path});
        delete oldState[path];
      }
      if (oldState[path]) {
        this.push({type: type, action: 'Update', path: path, body: body});
      } else {
        this.push({type: type, action: 'Create', path: path, body: body});
      }
    }.bind(this));
    
    files.on('error', reject);
    files.on('end', function () {
      Object.keys(oldState).forEach(function (path) {
        if (!newState[path]) {
          this.push({
            type: oldState[path] === 'Directory' ? 'Directory' : 'File',
            action: 'Delete',
            path: path
          });
        }
      }.bind(this));
      resolve(null);
    }.bind(this));
  }.bind(this));
};

RepositoryStream.prototype.setPending = function () {
  if (this.isReady === false) return;
  this.isReady = false;
  this.ready = new Promise(function (resolve) {
    this.setReady = function () {
      this.isReady = true;
      resolve(this);
    };
  }.bind(this));
};
RepositoryStream.waitUntilReady = function () {
  return this.ready;
};
