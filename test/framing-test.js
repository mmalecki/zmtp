var crypto = require('crypto');
var test = require('tap').test;
var zmq = require('zmq');
var bufferEqual = require('buffer-equal');
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
    t.ok(bufferEqual(msg, RANDOM), 'buffers must be equal');
    t.end();
  });
});
