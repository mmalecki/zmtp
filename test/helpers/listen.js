var net = require('net');
var ZMTP = require('../../');

module.exports = function (zmtpOptions, callback) {
  var zmtp = new ZMTP(zmtpOptions);
  var server = net.createServer(function (conn) {
    conn.pipe(zmtp).pipe(conn);
  }).listen(0, function () {
    callback(null, zmtp, server);
  });
};
