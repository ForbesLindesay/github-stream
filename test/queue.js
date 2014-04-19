'use strict';

var Promise = require('promise');

module.exports = Queue;
function Queue() {
  if (!(this instanceof Queue)) return new Queue();
  this._items = [];
  this._waiting = [];
  this.length = 0;
}

Queue.prototype.push = function(item) {
  var waiting = this._waiting.shift();
  this.length++;
  if (waiting) {
    waiting(item);
  } else {
    this._items.push(item);
  }
}

Queue.prototype.pop = function(cb) {
  var item = this._items.shift();
  this.length--;
  if (item) {
    return Promise.from(item).nodeify(cb);
  } else {
    return new Promise(function(resolve, reject) {
      this._waiting.push(resolve);
    }.bind(this)).nodeify(cb);
  }
}