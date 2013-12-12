var Transform = require('stream').Transform;
var util = require('util');

//
// http://rfc.zeromq.org/spec:15
//
// ZMTP is actually quite nice. Here's a human-readable specs for my own
// reference.
//
// ZMTP connection starts with a greeting (parser state -> 'greeting').
// First in greeting comes a signature, 10 bytes: xFF 8 * x00 x7F (parser state
// -> 'signature').
var SIGNATURE_LENGTH = 10;
// Next comes protocol version, always x01 (parser state -> 'revision'). We
// should error out here if we can't recognize the protocol version.
var REVISION = 1;
// Next is socket type. Here it goes (PAIR === x00, PUSH === x08):
var socketTypes = ['PAIR', 'PUB', 'SUB', 'REQ', 'REP', 'DEALER', 'ROUTER', 'PULL', 'PUSH'];
// (parser state -> 'socket_type').
// Here's where the RFC becomes confusing: next up in greeting is identity.

var ZMTP = module.exports = function (options) {
  if (!(this instanceof ZMTP))
    return new ZMTP(options);

  this._state = 'start';
  this._signature = new Buffer(SIGNATURE_LENGTH);
  this._signatureBytes = 0;
  Transform.call(this, { objectMode: true });
};
util.inherits(ZMTP, Transform);

ZMTP.prototype._write = function (chunk, enc, callback) {
  var self = this;
  var offset = 0;
  var byte;
  var signature = this._signature;

  console.log(chunk.toString('hex'), chunk.length);
  while (offset < chunk.length) {
    byte = chunk.readUInt8(offset++);
    if (this._state === 'start') {
      if (this._signatureBytes < SIGNATURE_LENGTH) {
        signature[this._signatureBytes++] = byte;
      }

      if (this._signatureBytes === SIGNATURE_LENGTH) {
        // We have whole signature. Parse it now.
        if (signature.readUInt8(0) !== 0xFF) {
          return this.emit('error', new Error('Invalid first byte of signature, xFF expected, got ' + byte));
        }

        // TODO: verify 8 x00 bytes?

        if (signature.readUInt8(SIGNATURE_LENGTH - 1) !== 0x7F) {
          return this.emit('error', new Error('Invalid last byte of signature, x7F expected, got ' + byte));
        }

        this._state = 'revision';
      }
    }
    else if (this._state === 'revision') {
      if (byte !== REVISION) {
        this.emit('error', new Error('Invalid revision, expected x01, got ' + byte));
        this._state = 'socket_type';
      }
    }
  }
  callback();
};
