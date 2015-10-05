'use strict';

var zlib = require('zlib');
var crypto = require('crypto');
var fs = require('fs');
var pth = require('path');
var Transform = require('barrage').Transform;
var Readable = require('barrage').Readable;
var Promise = require('promise');
var github = require('github-basic');
var tar = require('tar');
var concat = require('concat-stream');
var ms = require('ms');

module.exports = RepositoryStream;
function RepositoryStream(user, repo, options) {
  Readable.call(this, {objectMode: true});

  options = options || {};
  this._user = user;
  this._repo = repo;
  this._branch = options.branch || 'master';
  this._auth = typeof options.auth === 'string' ? {type: 'oauth', token: options.auth} : options.auth;

  this._rateLimit = 5000;
  this._rateRemaining = 5000;
  this._head = undefined;

  this._state = options.state || {etag: undefined, files: {}};

  var updateFrequency = ms((options.updateFrequency || '10s') + '');
  var retryFrequency = ms(options.retryFrequency || (updateFrequency + 'ms'));

  this.setPending();
  var doUpdate = function () {
    if (this._disposed) return;
    var before = this._head;
    var ready;
    this.getHead().then(function (head) {
      if (before !== head) {
        this.setPending();
        return this.pushUpdates(this.getFiles(head));
      }
    }.bind(this)).done(function () {
      this.setReady();
      setTimeout(doUpdate, updateFrequency);
    }.bind(this), function (err) {
      this.emit('error', err);
      setTimeout(doUpdate, retryFrequency);
    }.bind(this));
  }.bind(this);
  doUpdate();
}
RepositoryStream.prototype = Object.create(Readable.prototype);
RepositoryStream.prototype.constructor = RepositoryStream;
RepositoryStream.prototype._read = function () {};

RepositoryStream.prototype.dispose = function () {
  this._disposed = true;
};

/**
 * Return the sha of the head commit on the current branch.  This also updates the _etag and _head properties to enable caching.
 *
 * @returns {String}
 */
RepositoryStream.prototype.getHead = function () {
  var requestOptions = this._auth ? {auth: this._auth} : {};
  requestOptions.headers = {
    'If-None-Match': this._state.etag
  };
  return github.buffer('get', '/repos/:owner/:repo/git/refs/:ref', {
    owner: this._user,
    repo: this._repo,
    ref: 'heads/' + this._branch
  }, requestOptions).then(function (res) {
    this._rateLimit = res.headers['x-ratelimit-limit'];
    this._rateRemaining = res.headers['x-ratelimit-remaining'];
    if (res.statusCode === 200) {
      var body = JSON.parse(res.body.toString('utf8'));
      this._head = body.object.sha;
      this._state = {etag: res.headers['etag'], files: this._state.files};
    }
    return this._head;
  }.bind(this));
};

/**
 * Returns a stream of all the files in the repository.
 *
 * @returns {Stream.<FileSystemObject>
 */
RepositoryStream.prototype.getFiles = function (tag) {
  var stream = new Transform({objectMode: true});
  stream._transform = function (entry, _, callback) {
    entry.then(function (entry) {
      stream.push(entry);
    }).nodeify(callback);
  };
  var errored = false;
  function reject(err) {
    errored = true;
    setTimeout(function () {
      stream.emit('error', err);
      stream.end();
    }, 0);
  }
  function push(entry) {
    if (!errored) {
      var type = entry.type;
      var path = entry.path.replace(/^[^\/]*/, '');
      if (type === 'Directory') {
        stream.write(Promise.resolve({type: type, path: path}));
      } else if (type === 'File') {
        stream.write(new Promise(function (resolve) {
          return entry.pipe(concat(function (body) {
            resolve({type: type, path: path, body: body});
          }));
        }));
      }
    }
  }
  var requestOptions = this._auth ? {auth: this._auth} : {};
  github('GET', 'https://github.com/:user/:repo/archive/:tag.tar.gz', {
    user: this._user,
    repo: this._repo,
    tag: tag
  }, requestOptions).then(function (res) {
    if (res.statusCode !== 200) {
      throw new Error('Unexpected status code ' + res.statusCode);
    }
    var gunzip = zlib.createGunzip();
    var extract = new tar.Parse();
    res.body.on('error', reject);
    gunzip.on('error', reject);
    extract.on('error', reject);
    res.body.pipe(gunzip).pipe(extract);

    extract.on('entry', push);
    extract.on('end', function () {
      if (!errored) {
        stream.end();
      }
    });
  }).done(null, reject);
  return stream;
};

RepositoryStream.prototype.pushUpdates = function (files) {
  return new Promise(function (resolve, _reject) {
    var errored = false;
    function reject(err) {
      errored = true;
      _reject(err);
    }
    var oldState = this._state;
    var newState = this._state = {etag: oldState.etag, files: {}};
    files.on('data', function (node) {
      if (errored) return;
      var type = node.type;
      var path = node.path;
      var body = node.body || null;
      var hash = type === 'Directory' ? type : getHash(body);
      newState.files[path] = hash;
      if (oldState.files[path] === hash) return;
      if (oldState.files[path] === 'Directory' && type === 'File') {
        this.push({type: 'Directory', action: 'Delete', path: path});
        delete oldState.files[path];
      }
      if (oldState.files[path]) {
        this.push({type: type, action: 'Update', path: path, body: body});
      } else {
        this.push({type: type, action: 'Create', path: path, body: body});
      }
    }.bind(this));

    files.on('error', reject);
    files.on('end', function () {
      Object.keys(oldState.files).forEach(function (path) {
        if (!newState.files[path]) {
          this.push({
            type: oldState.files[path] === 'Directory' ? 'Directory' : 'File',
            action: 'Delete',
            path: path
          });
        }
      }.bind(this));
      this.emit('state-updated', newState);
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
RepositoryStream.prototype.waitUntilReady = function () {
  return this.ready;
};


function getHash(data) {
  return crypto.createHash('sha512').update(data).digest('hex');
}
