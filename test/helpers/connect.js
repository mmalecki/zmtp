var net = require('net');
var ZMTP = require('../../');

module.exports = function (port, options, callback) {
  var zmtp = new ZMTP(options);
  var sock = net.connect({ host: '127.0.0.1', port: port }, function () {
    callback(null);
  });

  sock.pipe(zmtp).pipe(sock);

  return zmtp;
};
