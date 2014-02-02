var net = require('net');
var ZMTP = require('./');
var zmq = require('zmq');
var zmqSock = zmq.socket('push');

zmqSock.bindSync('tcp://127.0.0.1:1337');

var zmtp = new ZMTP({ type: 'pull' });

var netSock = net.connect({ host: '127.0.0.1', port: 1337 }, function () {
  zmqSock.send('hello, ZMTP!');
});
netSock.pipe(zmtp).pipe(netSock);

zmtp.on('message', function (msg) {
  console.log('Got a message:', msg.toString('utf8'));
});
