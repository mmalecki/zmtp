var Transform = require('stream').Transform;
var util = require('util');
var bufferEqual = require('buffer-equal');

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
// Next is security mechanism. There are 3 of those (NULL, CURVE, PLAIN), we
// only support NULL:
var MECHANISM_NULL = new Buffer('NULL\0'); // No authentication or confidentiality.
var MECHANISM_LENGTH = 20;
// Next up is `as-server` field. Its value is either 0 or 1, depending on
// security mechanism. For NULL it's always 0 and NULL is the only mechanism
// we support rigth now.
// Then we have 31 * 0x0 filler.
var FILLER = new Buffer(31);
FILLER.fill('\0');

var ZMTP = module.exports = function (options) {
  if (!(this instanceof ZMTP)) {
    return new ZMTP(options);
  }

  this.type = options.type.toUpperCase();

  this._state = 'start';
  this._signature = new Buffer(SIGNATURE_LENGTH);
  this._signatureBytes = 0;

  this._mechanism = new Buffer(MECHANISM_LENGTH);
  this._mechanismBytes = 0;

  this._fillerBytes = 0;
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
  // TODO: support other mechanisms
  if (!bufferEqual(mechanism.slice(0, MECHANISM_NULL.length), MECHANISM_NULL)) {
    this.emit('error', new Error('Unsupported mechanism'));
  }
};

ZMTP.prototype._writeCommand = function (name, data) {
  // If command body (name + data) is smaller than 255 octets, we can use the
  // shorter length specifier: x04 octet
  // Otherwise, x06 8 * octet.
  var length = name.length + data.length;
  if (length <= 0xFF) {
    this.push(new Buffer([ 0x04, length ]));
  }
  else {
    // TODO: longer packets
  }

  this.push(name);
  this.push(data);
};

ZMTP.prototype._nullHandshake = function () {
  // NULL handshake metadata format is: key length octet, key, value length in
  // 4 octets and value.
  var key = 'Socket-Type';
  var value = this.type;
  var length = key.length + value.length + 5;
  var metadata = new Buffer(length);
  metadata.writeUInt8(key.length, 0);
  metadata.write(key, 1);
  metadata.writeUInt32BE(value.length, key.length + 1);
  metadata.write(value, key.length + 5);
  this._writeCommand('\x05READY', metadata);
};

ZMTP.prototype._transform = function (chunk, enc, callback) {
  var self = this;
  var offset = 0;
  var byte;
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
        this.push(mechanism);
        this._state = 'as-server';
      }
    }
    else if (this._state === 'as-server') {
      // TODO: for non-NULL mechanism, we need to support non-zero `as-server` field
      this.push(new Buffer([0]));
      this._state = 'filler';
    }
    else if (this._state === 'filler') {
      ++this._fillerBytes;
      if (this._fillerBytes === FILLER.length) {
        this.push(FILLER);
        this._state = 'handshake';
      }
    }
    else if (this._state === 'handshake') {
      this._nullHandshake();
      this._state = 'traffic';
    }
  }
  callback();
};
