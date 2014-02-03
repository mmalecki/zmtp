var test = require('tap').test;
var net = require('net');
var zmq = require('zmq');
var ZMTP = require('../');
var connect = require('./helpers/connect.js');

var PORT = 5892;
var HELLO = 'hello, ZMTP!';

test('zmtp/push-pull', function (t) {
  var zmqSock = zmq.socket('pull');
  zmqSock.bindSync('tcp://127.0.0.1:' + PORT);

  var zmtp = connect(PORT, { type: 'push' }, function (err) {
    t.ok(!err, 'Connecting should work');

    zmtp.once('ready', function () {
      zmtp.send(HELLO);
    });
  });

  zmqSock.on('message', function (msg) {
    t.equal(msg.toString(), HELLO);
    t.end();

    zmqSock.close();
  });
});
