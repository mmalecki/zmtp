var crypto = require('crypto');
var test = require('tap').test;
var net = require('net');
var zmq = require('zmq');
var ZMTP = require('../');

var RANDOM = crypto.randomBytes(4096);

test('zmtp/pull-push/zmtp-zmtp', function (t) {
  var pull = new ZMTP({ type: 'pull' });
  var push = new ZMTP({ type: 'push' });

  push.on('ready', function () {
    push.send(RANDOM);
  });

  pull.pipe(push).pipe(pull);
  pull.on('message', function (msg) {
    t.equal(msg, RANDOM);
    t.end();
  });
});
