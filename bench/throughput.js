var net = require('net');
var crypto = require('crypto');
var zmq = require('zmq');
var ZMTP = require('../');
var port = Math.floor(Math.random() * 4096 + 1024);

function runner(zmtpish, buffer) {
  return function (cb) {
    zmtpish.send(buffer);
    cb();
  };
}

function runZmq(size) {
  var buffer = crypto.randomBytes(size);
  var server = zmq.socket('pull');
  var client;
  server.bindSync('tcp://127.0.0.1:' + port);

  client = zmq.socket('push');
  client.connect('tcp://127.0.0.1:' + port++);

  return runner(client, buffer);
}

function runZmtp(size) {
  var buffer = crypto.randomBytes(size);
  var push = new ZMTP({ type: 'push' });
  var server = net.createServer(function (sock) {
    var pull = new ZMTP({ type: 'pull' });
    sock.pipe(pull).pipe(sock);
  }).listen(0, function () {
    var conn = net.connect(server.address().port);
    conn.pipe(push).pipe(conn);
  });
  return runner(push, buffer);
}

exports.compare = {
  'zmq, size=128': runZmq(128),
  'zmtp, size=128': runZmtp(128),
  'zmq, size=256': runZmq(256 - 1),
  'zmtp, size=256': runZmtp(256 - 1),
  'zmq, size=512': runZmq(512 - 1),
  'zmtp, size=512': runZmtp(512 - 1),
  'zmq, size=1024': runZmq(1024 - 2),
  'zmtp, size=1024': runZmtp(1024 - 2)
};

setTimeout(function () {
  require('bench').runMain();
}, 1000);
