var test = require('tap').test;
var net = require('net');
var zmq = require('zmq');
var ZMTP = require('../');
var connect = require('./helpers/connect.js');
var listen = require('./helpers/listen.js');

var PORT = 5891;
var HELLO = 'hello, ZMTP!';

test('zmtp/pull-push/zmtp-zmtp', function (t) {
  listen({ type: 'pull' }, function (_, push, server) {
    var pull = connect(server.address().port, { type: 'push' }, function (err) {
      t.ok(!err, 'Connecting should work');

      push.on('ready', function () {
        push.send(HELLO);
      });
    });

    pull.on('message', function (msg) {
      t.equal(msg.toString(), HELLO);
      t.end();

      server.close();
    });
  });
});
