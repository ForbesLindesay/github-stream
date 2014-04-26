'use strict';

var zlib = require('zlib');
var crypto = require('crypto');
var Readable = require('barrage').Readable;
var Promise = require('promise');
var github = require('github-basic');
var tar = require('tar');
var concat = require('concat-stream');

module.exports = CurrentFilesStream;
function CurrentFilesStream(user, repo, auth, tag) {
  Readable.call(this, {objectMode: true});

  this._user = user;
  this._repo = repo;
  this._auth = typeof auth === 'string' ? {type: 'oauth', token: auth} : auth;

  var ready = Promise.from(null);
  var errored = false;

  var push = function (entry) {
    var result;
    var type = entry.type;
    var path = entry.path.replace(/^[^\/]*/, '');
    if (type === 'Directory') {
      result = {type: type, path: path, hash: '<directory>'};
    } else if (type === 'File') {
      result = new Promise(function (resolve) {
        return entry.pipe(concat(function (body) {
          resolve({type: type, path: path, hash: getHash(body), body: body});
        }));
      });
    }
    if (result) {
      ready = ready.then(function () {
        return result;
      }).then(function (result) {
        if (!errored) {
          this.push(result);
        }
      }.bind(this));
    }
  }.bind(this);
  var end = function () {
    ready = ready.then(function () {
      if (!errored) {
        this.push(null);
      }
    })
  }.bind(this);
  var reject = function (err) {
    errored = true;
    setTimeout(function () {
      this.emit('error', err);
      this.push(null);
    }.bind(this), 0);
  }.bind(this);

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
    extract.on('end', end);
  }).done(null, reject);
  ready.done(null, reject);
}
CurrentFilesStream.prototype = Object.create(Readable.prototype);
CurrentFilesStream.prototype.constructor = CurrentFilesStream;
CurrentFilesStream.prototype._read = function () {};

function getHash(data) {
  return crypto.createHash('sha512').update(data).digest('hex');
}
