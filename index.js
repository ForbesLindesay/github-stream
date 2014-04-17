'use strict';

var Readable = require('stream').Readable;
var zlib = require('zlib');
var crypto = require('crypto');
var fs = require('fs');
var pth = require('path');
var Promise = require('promise');
var github = require('github-basic');
var tar = require('tar');
var concat = require('concat-stream');
var ms = require('ms');
var mkdirp = require('mkdirp');

module.exports = RepositoryStream;
function RepositoryStream(user, repo, auth, options) {
  Readable.call(this, {objectMode: true});
  
  options = options || {};
  this._user = user;
  this._repo = repo;
  this._branch = options.branch || 'master';
  this._auth = auth;

  this._rateLimit = 5000;
  this._rateRemaining = 5000;
  this._etag = undefined;
  this._head = undefined;

  var updateFrequency = ms((options.update || 1000) + '');

  this.setPending();
  var doUpdate = function () {
    var before = this._head;
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
      setTimeout(doUpdate, updateFrequency * 10);
    }.bind(this));
  }.bind(this);
  doUpdate();
}
RepositoryStream.prototype = Object.create(Readable.prototype);
RepositoryStream.prototype.constructor = RepositoryStream;
RepositoryStream.prototype._read = function () {};

/**
 * Return the sha of the head commit on the current branch.  This also updates the _etag and _head properties to enable caching.
 *
 * @returns {String}
 */
RepositoryStream.prototype.getHead = function () {
  return github.buffer('get', '/repos/:owner/:repo/git/refs/:ref', {
    owner: this._user,
    repo: this._repo,
    ref: 'heads/' + this._branch
  }, {auth: this._auth, headers: {
    'If-None-Match': this._etag
  }}).then(function (res) {
    this._rateLimit = res.headers['x-ratelimit-limit'];
    this._rateRemaining = res.headers['x-ratelimit-remaining'];
    if (res.statusCode === 200) {
      var body = JSON.parse(res.body.toString('utf8'));
      this._head = body.object.sha;
      this._etag = res.headers['etag'];
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
  var stream = new Readable({objectMode: true});
  stream._read = function () {};
  var errored;
  function reject(err) {
    errored = true;
    setTimeout(function () {
      stream.emit('error', err);
      stream.push(null);
    }, 0);
  }
  function push(data) {
    if (!errored) stream.push(data);
  }
  github('GET', '/:user/:repo/archive/:tag.tar.gz', {
    user: this._user,
    repo: this._repo,
    tag: tag
  }, {
    auth: this._auth,
    host: 'github.com'
  }).then(function (res) {
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
      push(null);
    });
  }).done(null, reject);
  return stream;
};

RepositoryStream.prototype.pushUpdates = function (files) {
  return new Promise(function (_resolve, _reject) {
    var errored = false;
    function resolve() {
      _resolve(null);
    }
    function reject(err) {
      errored = true;
      _reject(err);
    }
    files.on('data', function (node) {
      if (errored) return;
      var type = node.type;
      var path = node.path.replace(/^[^\/]*/, '');
      if (type === 'Directory') {
        this.push({type: type, path: path});
      } else if (type === 'File') {
        node.pipe(concat(function (body) {
          if (errored) return;
          this.push({type: type, path: path, body: body});
          
        }.bind(this)));
      }
    }.bind(this));
    files.on('error', reject);
    files.on('end', resolve);
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


function sha1(data) {
  return crypto.createHash('sha1').update(data).digest('hex');
}
