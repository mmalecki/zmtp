var test = require('tap').test;
var net = require('net');
var zmq = require('zmq');
var ZMTP = require('../');

var HELLO = 'hello, ZMTP!';

test('zmtp/pull-push/zmtp-zmtp', function (t) {
  var pull = new ZMTP({ type: 'pull' });
  var push = new ZMTP({ type: 'push' });

  push.on('ready', function () {
    push.send(HELLO);
  });

  pull.pipe(push).pipe(pull);
  pull.on('message', function (msg) {
    t.equal(msg.toString(), HELLO);
    t.end();
  });
});
