var Transform = require('stream').Transform;
var util = require('util');

//
// http://rfc.zeromq.org/spec:23
//
// ZMTP is actually quite nice. Here's a human-readable specs for my own
// reference.
//
// ZMTP connection starts with a greeting (parser state -> 'greeting').
// First in greeting comes a signature, 10 bytes: xFF 8 * x00 x7F (parser state
// -> 'signature').
var SIGNATURE_LENGTH = 10;
// Next comes protocol version, x03 x00 for ZMTP 3.0. (parser state ->
// 'version-major', 'version-minor'). We should error out here if we can't
// recognize the protocol version.
var VERSION_MAJOR = new Buffer([3]);
var VERSION_MINOR = new Buffer([0]);
// Next is socket mechanism.
var MECHANISM_LENGTH = 20;
var socketTypes = ['PAIR', 'PUB', 'SUB', 'REQ', 'REP', 'DEALER', 'ROUTER', 'PULL', 'PUSH'];
// (parser state -> 'socket_type').
// Here's where the RFC becomes confusing: next up in greeting is identity.

var ZMTP = module.exports = function (options) {
  if (!(this instanceof ZMTP))
    return new ZMTP(options);

  this._state = 'start';
  this._signature = new Buffer(SIGNATURE_LENGTH);
  this._signatureBytes = 0;

  this._mechanism = new Buffer(MECHANISM_LENGTH);
  this._mechanismBytes = 0;
  Transform.call(this, { objectMode: true });
};
util.inherits(ZMTP, Transform);

ZMTP.prototype._parseSignature = function () {
  var signature = this._signature;
  if (signature.readUInt8(0) !== 0xFF) {
    return this.emit('error', new Error('Invalid first byte of signature, xFF expected, got ' + byte));
  }

  if (signature.readUInt8(SIGNATURE_LENGTH - 1) !== 0x7F) {
    return this.emit('error', new Error('Invalid last byte of signature, x7F expected, got ' + byte));
  }
};

ZMTP.prototype._parseMechanism = function () {
  var mechanism = this._mechanism;
  console.log('mechanism', mechanism.toString('hex'));
};

ZMTP.prototype._transform = function (chunk, enc, callback) {
  var self = this;
  var offset = 0;
  var byte;
  var tmpBuffer = new Buffer(1);
  var signature = this._signature;
  var mechanism = this._mechanism;

  console.log(chunk.toString('hex'), chunk.length);
  while (offset < chunk.length) {
    byte = chunk.readUInt8(offset++);
    if (this._state === 'start') {
      if (this._signatureBytes < SIGNATURE_LENGTH) {
        signature[this._signatureBytes++] = byte;
      }

      if (this._signatureBytes === SIGNATURE_LENGTH) {
        this._parseSignature();
        this.push(signature);
        this._state = 'version-major';
      }
    }
    else if (this._state === 'version-major') {
      if (byte !== VERSION_MAJOR[0]) {
        this.emit('error', new Error('Invalid revision, expected x03, got ' + byte));
      }
      this.push(VERSION_MAJOR);
      this._state = 'version-minor';
    }
    else if (this._state === 'version-minor') {
      if (byte !== VERSION_MINOR[0]) {
        this.emit('error', new Error('Invalid minor version, expected x00, got ' + byte));
      }
      this.push(VERSION_MINOR);
      this._state = 'mechanism';
    }
    else if (this._state === 'mechanism') {
      if (this._mechanismBytes < MECHANISM_LENGTH) {
        mechanism[this._mechanismBytes++] = byte;
      }

      if (this._mechanismBytes === MECHANISM_LENGTH) {
        this._parseMechanism();
        // TODO: reply with something
        this._state = 'as-server';
      }
    }
  }
  callback();
};
