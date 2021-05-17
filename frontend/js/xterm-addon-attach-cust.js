var AttachAddon = (function () {
    function AttachAddon(socket, options) {
        this._disposables = [];
        this._socket = socket;
        this._socket.binaryType = 'arraybuffer';
        this._bidirectional = (options && options.bidirectional === false) ? false : true;
        this._lastack = -1;
        this._lastsendmillis = -1;
        this._lastackmillis = -1;
        this._latency = 0;
    }
    AttachAddon.prototype.activate = function (terminal) {
        var _this = this;
        this._disposables.push(addSocketListener(this._socket, 'message', function (ev) {
            if (encryptionPacketHandler(_this._socket, ev.data))
             return;
            var data = decrypt(ev.data, _this._socket);
            if (data == "\u0005") {
                _this._socket.send("\u0006");
            } else if (data == "\u0006") {
                _this._lastack = unix__();
                _this._lastackmillis = millis__();
	    } else {
                terminal.write(typeof data === 'string' ? data : new Uint8Array(data));
            }
        }));
        this._lastack = unix__();
        this._pingtask = setInterval(function(){
            if (_this._socket.readyState === WebSocket.CLOSED || _this._socket.readyState === WebSocket.CLOSING) {
             terminal.write("\n\rConnection failure.");
             clearInterval(_this._pingtask);
             return;
            }
            if (_this._lastackmillis > 0) {
             _this._latency = _this._lastackmillis - _this.lastsendmillis;
            }
	    if (_this._socket.readyState == WebSocket.OPEN) {
             _this._socket.send("\u0005");
            }
            _this.lastsendmillis = millis__();
            if (unix__()-_this._lastack >= 5 && _this._socket.readyState == WebSocket.OPEN) {
             terminal.write("\n\n\rServer timed out.");
             _this._socket.close();
             clearInterval(_this._pingtask);
	     _this.dispose();
            }
        },200);
        if (this._bidirectional) {
            this._disposables.push(terminal.onData(function (data) { return _this._sendData(data); }));
            this._disposables.push(terminal.onBinary(function (data) { return _this._sendBinary(data); }));
        }
        this._disposables.push(addSocketListener(this._socket, 'close', function () { return _this.dispose(); }));
        this._disposables.push(addSocketListener(this._socket, 'error', function () { return _this.dispose(); }));
        this._disposables.push(addSocketListener(this._socket, 'open', function () {
         setupEncryption(_this._socket);
        }));
    };
    AttachAddon.prototype.dispose = function () {
        for (var _i = 0, _a = this._disposables; _i < _a.length; _i++) {
            var d = _a[_i];
            d.dispose();
        }
    };
    AttachAddon.prototype._sendData = function (data) {
        if (this._socket.readyState !== 1) {
            return;
        }
        this._socket.send(encrypt(data));
    };
    AttachAddon.prototype._sendBinary = function (data) {
        if (this._socket.readyState !== 1) {
            return;
        }
        var buffer = new Uint8Array(data.length);
        for (var i = 0; i < data.length; ++i) {
            buffer[i] = data.charCodeAt(i) & 255;
        }
        this._socket.send(encrypt(buffer));
    };
    return AttachAddon;
}());
this.AttachAddon = AttachAddon;
function addSocketListener(socket, type, handler) {
    socket.addEventListener(type, handler);
    return {
        dispose: function () {
            if (!handler) {
                return;
            }
            socket.removeEventListener(type, handler);
        }
    };
}
function unix__() {
 return Math.floor(Date.now() / 1000);
}
function millis__() {
 return Date.now();
}
