var net = require('net');
var crypto = require('crypto');
var zmq = require('zmq');
var ZMTP = require('../');

var on = true;
var mgs = 0;

var RANDOM = crypto.randomBytes(128);

function reallyRun(zmtp) {
  zmtp.send(RANDOM);
  on && setImmediate(function () {
    reallyRun(zmtp);
  });
}

function run(zmtp, cb) {
  msg = 0;
  on = true;
  setTimeout(function () {
    on = false;
    cb(msg);
  }, 10000);

  reallyRun(zmtp);
}

function zmtp(cb) {
  console.log('zmtp');
  var server = net.createServer(function (sock) {
    var zmtp = new ZMTP({ type: 'pull' });
    sock.pipe(zmtp).pipe(sock);
    zmtp.on('message', function () {
      ++msg;
    });
  }).listen(0, function () {
    var zmtp = new ZMTP({ type: 'push' });
    var conn = net.connect(server.address().port);
    conn.pipe(zmtp).pipe(conn);

    zmtp.on('ready', function () {
      run(zmtp, function (msg) {
        console.log('ztmp: ' + msg + ' messages in 10 s');
        conn.end();
        server.close();
        cb();
      });
    });
  });;
}

function zmq_(cb) {
  console.log('zmq');
  var server = zmq.socket('pull');
  server.bindSync('tcp://127.0.0.1:9000');
  server.on('message', function () {
    ++msg;
  });

  var client = zmq.socket('push');
  client.connect('tcp://127.0.0.1:9000');
  run(client, function (msg) {
    console.log('zmq: ' + msg + ' messages in 10 s');
    client.close();
    server.close();
    cb();
  });
}

zmq_(function () {
  zmtp(function () {});
});
