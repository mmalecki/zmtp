var test = require('tap').test;
var net = require('net');
var zmq = require('zmq');
var ZMTP = require('../');
var connect = require('./helpers/connect.js');

var PORT = 5893;
var HELLO = 'hello, ZMTP!';

test('zmtp/pull-push/zmtp-zmq', function (t) {
  var zmqSock = zmq.socket('push');
  zmqSock.bindSync('tcp://127.0.0.1:' + PORT);

  var zmtp = connect(PORT, { type: 'pull' }, function (err) {
    t.ok(!err, 'Connecting should work');
    zmqSock.send(HELLO);
  });

  zmtp.on('message', function (msg) {
    t.equal(msg.toString(), HELLO);
    t.end();

    zmqSock.close();
  });
});
