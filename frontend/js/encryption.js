/*
Charlie-WebShell
Copyright (C) 2021 Charlie999

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*/

// E2EE functions for the terminal

var encrypted = false;

var k = undefined;
var kr = undefined;

var iv = undefined;

const disableEncryption = false;

function setupEncryption(sock) {
 if (disableEncryption)
  return

 console.log("setting up encryption");

 console.log("generating key");
// var arr = new Uint32Array(8);
// window.crypto.getRandomValues(arr);
 var b = getRandomBytes(16);
 k = ab2str(b);
 kr = b;

 iv = getRandomBytes(16);

 console.log("key generated, "+k.hexEncode()+"  iv="+ab2str(iv).hexEncode());

 sock.send("\u0011ESTART");
}

function encryptionPacketHandler(sock, data) {
 if (typeof data === 'string') {
  if (data.startsWith("\u0011")) {
   var m = data.replace("\u0011","");
   if (m.startsWith("EACK")) {
    console.log("got encryption start ack");
    var sk = atob(m.split(";")[1]);
    var sc = atob(m.split(";")[2]);
    console.log("server key="+sk);
    console.log("server crt="+" data:application/x-x509-ca-cert;base64,"+btoa(sc.split("\n\n\n=CA=\n")[0]));
    console.log("server  ca="+" data:application/x-x509-ca-cert;base64,"+btoa(sc.split("\n\n\n=CA=\n")[1]));

    var crypt = new JSEncrypt();
    crypt.setPublicKey(sk);

    var ek = crypt.encrypt(btoa(ab2str(kr)),"RSAES-PKCS1-v1_5");

    console.log(ek);
    console.log(btoa(ab2str(iv)));
    sock.send("\u0011EK;"+ek+";"+btoa(ab2str(iv)));
   }
   if (m == "E2ACK") {
    console.log("server accepted key, enabling encryption");

    sock.send("\u0011E2ENABLE");
    encrypted = true;
   }
   return true;
  }
 }

 return false;
}

function isEncrypted(sock) {
 return encrypted && sock.readyState == WebSocket.OPEN;
}

function encrypt(data) {
 if (!encrypted || data.startsWith("\u0010") || data.startsWith("\u0005") || data.startsWith("\u0006"))
  return data;

 var plain = aesjs.utils.utf8.toBytes(data.padEnd(16+(data.length) - data.length%16, "\x1E"));

 var cbc = new aesjs.ModeOfOperation.cbc(kr, iv);
 var enc = cbc.encrypt(plain);

 return ab2str(enc).hexEncode();
}

function decrypt(data,sock) {
 if (!encrypted || data.startsWith("\u0010") || data==("\u0005") || data==("\u0006"))
  return data;

 var ciphertext = aesjs.utils.hex.toBytes(data);

 var cbc = new aesjs.ModeOfOperation.cbc(kr, iv);
 try {
  var dec = cbc.decrypt(ciphertext);

 } catch (e) {
  console.log("Error decrypting "+data);
  console.log(e);
  return "<DECRYPTION ERROR>";
 }

 var size = dec.length;
 for (i in dec) {
  if (dec[i] == 30) {
   size--;
  }
 }

 var out = new Uint8Array(size);

 var i = 0;
 for (j in dec) {
  if (dec[j] != 30) {
   out[i] = dec[j];
   i++;
  }
 }

 return dec;
}

String.prototype.hexEncode = function (delim) {
    return this.split("").map(function(c) {
        return ("0" + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(delim || "");
};

String.prototype.hexDecode = function(){
    var j;
    var hexes = this.match(/.{1,4}/g) || [];
    var back = "";
    for(j = 0; j<hexes.length; j++) {
        back += String.fromCharCode(parseInt(hexes[j], 16));
    }

    return back;
}

function ab2str(buf) {
  return String.fromCharCode.apply(null, new Uint16Array(buf));
}

let getRandomBytes = (
  (typeof self !== 'undefined' && (self.crypto || self.msCrypto))
    ? function() { // Browsers
        var crypto = (self.crypto || self.msCrypto), QUOTA = 65536;
        return function(n) {
          var a = new Uint8Array(n);
          for (var i = 0; i < n; i += QUOTA) {
            crypto.getRandomValues(a.subarray(i, i + Math.min(n - i, QUOTA)));
          }
          return a;
        };
      }
    : function() { // Node
        return require("crypto").randomBytes;
      }
)();

function hexStringToArrayBuffer(hexString) {
    // remove the leading 0x
    hexString = hexString.replace(/^0x/, '');

    // ensure even number of characters
    if (hexString.length % 2 != 0) {
        console.log('WARNING: expecting an even number of characters in the hexString');
    }

    // check for some non-hex characters
    var bad = hexString.match(/[G-Z\s]/i);
    if (bad) {
        console.log('WARNING: found non-hex characters', bad);
    }

    // split the string into pairs of octets
    var pairs = hexString.match(/[\dA-F]{2}/gi);

    // convert the octets to integers
    var integers = pairs.map(function(s) {
        return parseInt(s, 16);
    });

    var array = new Uint8Array(integers);
    console.log(array);

    return array.buffer;
}

function removeItemAll(arr, value) {
  var i = 0;
  while (i < arr.length) {
    if (arr[i] === value) {
      arr.splice(i, 1);
    } else {
      ++i;
    }
  }
  return arr;
}

