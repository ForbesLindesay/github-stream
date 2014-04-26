'use strict';

var Readable = require('barrage').Readable;
var Promise = require('promise');
var github = require('github-basic');
var ms = require('ms');

module.exports = CommitStream;
function CommitStream(user, repo, auth, options) {
  Readable.call(this, {objectMode: true});

  options = options || {};
  this._user = user;
  this._repo = repo;
  this._branch = options.branch || 'master';
  this._auth = typeof auth === 'string' ? {type: 'oauth', token: auth} : auth;

  this._rateLimit = 5000;
  this._rateRemaining = 5000;
  this._etag = undefined;
  this._head = undefined;

  var updateFrequency = ms((options.updateFrequency || (this._auth ? '1s' : '60s')) + '');
  var retryFrequency = ms(options.retryFrequency || (updateFrequency + 'ms'));

  var doUpdate = function () {
    var before = this._head;
    this.getHead().then(function (head) {
      if (before !== head) {
        this.push(head);
      }
    }.bind(this)).done(function () {
      setTimeout(doUpdate, updateFrequency);
    }, function (err) {
      this.emit('error', err);
      setTimeout(doUpdate, retryFrequency);
    }.bind(this));
  }.bind(this);
  doUpdate();
}
CommitStream.prototype = Object.create(Readable.prototype);
CommitStream.prototype.constructor = CommitStream;
CommitStream.prototype._read = function () {};

/**
 * Return the sha of the head commit on the current branch.  This also updates the _etag and _head properties to enable caching.
 *
 * @returns {String}
 */
CommitStream.prototype.getHead = function () {
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
