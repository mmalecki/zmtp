var Transform = require('stream').Transform;
var util = require('util');
var bufferEqual = require('buffer-equal');
var Frame = require('./lib/frame.js');

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
// After filler comes a handshake. Since handshake is actually a command, let's
// describe command format first:
//
//    ;   A command is a single long or short frame
//    command = command-size command-body
//    command-size = %x04 short-size | %x06 long-size
//    short-size = OCTET          ; Body is 0 to 255 octets
//    long-size = 8OCTET          ; Body is 0 to 2^63-1 octets
//    command-body = command-name command-data
//    command-name = OCTET 1*255command-name-char
//    command-name-char = ALPHA
//    command-data = *OCTET
//
// So, each command starts with `command-size` field. For commands bigger than
// 255 octets, we have to use the `long-size` format, where `command-size`
// starts with x06 followed by 8 octets of size.
// Otherwise, we can roll with `short-size`, which starts with x04 followed by
// one octet of size.
var COMMAND_SHORT = 0x04;
var COMMAND_LONG = 0x06;
// `command-body` (next after `command-size`) consists of one octet of command
// name size, command name (maximum 255 chars), followed by command data (bunch
// of octets, no length indication needed).
//
// *BUT* there's also framing. ZMTP's framing format is pretty simple. First
// comes one byte of flags, next size (1 or 8 octets, depending whether this
// is a long frame, as determined by a flag) and then frame body.
// Flags are as follows:
//
//   * bits 7 - 3: reserved, always 0
//   * bit 2: COMMAND, 1 for command frame and 0 for message frame
//   * bit 1: LONG, 1 for long frame (the size field will be 8 octects)
//   * bit 0: MORE, 1 if there are more frames to follow (incomplete frame),
//     0 if this is the last frame for this message
//
var READY = new Buffer('READY');

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

  this._frames = [];
  this._frameBodyBytes = 0;

  Transform.call(this, { objectMode: true });
};
util.inherits(ZMTP, Transform);

ZMTP.prototype._parseSignature = function () {
  var signature = this._signature;
  var byte = signature.readUInt(8);
  if (byte !== 0xFF) {
    return this.emit('error', new Error('Invalid first byte of signature, xFF expected, got ' + byte));
  }

  byte = signature.readUInt8(SIGNATURE_LENGTH - 1);
  if (byte !== 0x7F) {
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

ZMTP.prototype._writeFramed = function (isCommand, data) {
  var totalLength = data.length;
  var frameBody, frame, end;

  for (var i = 0; i < data.length; i += 256) {
    end = i + 256;
    frame = new Frame({
      more: end < totalLength,
      command: isCommand,
      body: data.slice(i, end)
    });
    this.push(frame.toBuffer());
  }
};

ZMTP.prototype._writeCommand = function (name, data) {
  // If command body (name + data) is smaller than 255 octets, we can use the
  // shorter length specifier: x04 octet
  // Otherwise, x06 8 * octet.
  var length = name.length + data.length + 1;
  if (length <= 0xFF) {
    this.push(new Buffer([ COMMAND_SHORT, length ]));
  }
  else {
    // TODO: longer packets
  }

  this.push(new Buffer([ name.length ]));
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
  this._writeCommand(READY, metadata);
};

ZMTP.prototype._parseNullHandshake = function (data) {
  this.emit('ready');
};

ZMTP.prototype._parseCommand = function (body) {
  var nameLength = body[0];
  var name = body.slice(1, nameLength + 1);
  var data = body.slice(nameLength + 1);
  if (bufferEqual(name, READY)) {
    this._parseNullHandshake(data);
  }
};

ZMTP.prototype._parseMessage = function (body) {
  this.emit('message', body);
};

ZMTP.prototype._processFrames = function () {
  // TODO: this is a naive approach where we concat all our frames to process
  // them. We might not have to do that, which'd be beneficial for memory usage.
  var body = Buffer.concat(this._frames.map(function (frame) {
    return frame.body;
  }));

  return this._frames[0].command
    ? this._parseCommand(body)
    : this._parseMessage(body);
};

ZMTP.prototype._transform = function (chunk, enc, callback) {
  var self = this;
  var offset = 0;
  var byte;
  var signature = this._signature;
  var mechanism = this._mechanism;
  var thisFrame;

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
      if (byte < VERSION_MAJOR[0]) {
        this.emit('error', new Error('Invalid major revision, got ' + byte + ', expected at least ' + VERSION_MAJOR[0]));
      }
      this.peerMajorVersion = byte;
      this.push(VERSION_MAJOR);
      this._state = 'version-minor';
    }
    else if (this._state === 'version-minor') {
      this.peerMinorVersion = byte;
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
        this._nullHandshake();
        this._state = 'frame-header-flags';
      }
    }
    else if (this._state === 'frame-header-flags') {
      // TODO: support long frames
      thisFrame = new Frame();
      thisFrame.parseFlags(byte);
      this._frameBodyBytes = 0;
      this._frames.push(thisFrame);
      this._state = 'frame-header-size';
    }
    else if (this._state === 'frame-header-size') {
      thisFrame = this._frames[this._frames.length - 1];
      thisFrame.length = byte;
      thisFrame.body = new Buffer(thisFrame.length);
      this._state = 'frame-body';
    }
    else if (this._state === 'frame-body') {
      thisFrame = this._frames[this._frames.length - 1];
      thisFrame.body[this._frameBodyBytes++] = byte;
      if (this._frameBodyBytes === thisFrame.length) {
        if (!thisFrame.more) {
          this._processFrames();
          this._frames.length = 0;
        }
        this._state = 'frame-header-flags';
      }
    }
  }
  callback();
};

ZMTP.prototype.send = function (message) {
  this._writeFramed(false, new Buffer(message));
};
