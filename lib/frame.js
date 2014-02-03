var FRAME_COMMAND = 1 << 2;
var FRAME_LONG = 1 << 1;
var FRAME_MORE = 1 << 0;

var Frame = module.exports = function (options) {
  var opts = options || {};
  this.more = !!opts.more;
  this.command = !!opts.command;

  if (opts.length || opts.body) {
    this.length = opts.length || opts.body.length;
  }
  this.body = opts.body;
};

Frame.prototype.more = null;
Frame.prototype.command = null;
Frame.prototype.length = null;
Frame.prototype.body = null;

Frame.prototype.parseFlags = function (byte) {
  this.more = !!(byte & FRAME_MORE);
  this.command = !!(byte & FRAME_COMMAND);

  if (byte & FRAME_LONG) {
    throw new Error('Long frames not supported yet');
  }
};

Frame.prototype.toBuffer = function () {
  var flags = 0;
  var frame;

  if (this.more) {
    flags &= FRAME_MORE;
  }
  if (this.command) {
    flags &= FRAME_COMMAND;
  }

  frame = new Buffer(this.length + 2);
  frame.writeUInt8(flags, 0);
  frame.writeUInt8(this.length, 1);
  this.body.copy(frame, 2);
  console.log(frame.toString('hex'), frame.toString('ascii'));
  return frame;
};
