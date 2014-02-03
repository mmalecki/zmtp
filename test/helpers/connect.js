var net = require('net');
var ZMTP = require('../../');

module.exports = function (port, callback) {
  var zmtp = new ZMTP({ type: 'pull' });
  var sock = net.connect({ host: '127.0.0.1', port: port }, function () {
    callback(null, zmtp);
  });

  sock.pipe(zmtp).pipe(sock);

  return zmtp;
};
