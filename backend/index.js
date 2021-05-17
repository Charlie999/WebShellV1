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

const pty = require('node-pty');
const WebSocket = require('ws');
const fs = require('fs');
const exec = require('child_process').exec
const pem2jwk = require('pem-jwk').pem2jwk
const crypto = require('crypto');
const { rsaPemToJwk } = require('rsa-pem-der-to-jwk')
const aesjs = require("aes-js");
const temp = require("temp");
const openssl = require("openssl-wrapper").exec;
const http = require("http");
const qs = require("querystring");

temp.track();

var pubkey = undefined;
var privkey = undefined;

var signed_crt = undefined;

const { generateKeyPair } = require('crypto');
generateKeyPair('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: 'spki',
    format: 'pem'
  },
  privateKeyEncoding: {
    type: 'pkcs8',
    format: 'pem'
  }
}, (err, publicKey, privateKey) => {
  pubkey = publicKey;
  privkey = privateKey;
  console.log("Generated keys, doing crypto test.");

  var t1 = crypto.publicEncrypt(pubkey,"Crypto test passed");
  var t2 = crypto.privateDecrypt(privkey, t1);
  console.log(t2.toString());

  console.log("Getting CSR..");
  var privkey_i = temp.openSync("gwterm-privkey");
  var pubkey_i = temp.openSync("gwterm-pubkey");

  fs.write(privkey_i.fd, privkey, (err)=>{if(err){console.log(err);}});
  fs.write(pubkey_i.fd, pubkey, (err)=>{if(err){console.log(err);}});

  fs.close(privkey_i.fd, (err)=>{if(err){console.log(err);}});
  fs.close(pubkey_i.fd, (err)=>{if(err){console.log(err);}});

  var req = null;
  openssl("req", {"new":true, "key":privkey_i.path, "subj":"/C=GB/ST=England/L=London/O=Gateway Terminal/CN=gateway_terminal"}, function(e,b){
   if (e) {
    console.log(e.toString());
    return;
   }

   var data = qs.stringify({
    "cert":Buffer.from(b.toString()).toString("base64")
   });

   var opts = {
    hostname: '127.0.0.1',
    port: 4931,
    path: '/cgi/sign.cgi',
    method: 'POST',
    headers: {
     "Content-Type" : "application/x-www-form-urlencoded",
     "Content-Length": data.length
    }
   }

   var req = http.request(opts, res => {
    res.on("data", d=>{
     signed_crt = (d.toString());
     console.log("Got signed certificate");
    });
   });

   req.on("error",e=>{console.log(e);});

   req.write(data);
   req.end();
  });

});

const wss = new WebSocket.Server({ port: 8081 });

function unix() {
 return Math.floor(new Date().getTime() / 1000);
}

console.log("Ready");

wss.on('connection', function connection(ws, req) {
 var child = pty.spawn('/bin/login', [], {
   name: 'xterm-color',
   cols: 80,
   rows: 25,
   cwd: process.env.HOME,
   env: process.env
 });

 var cli = req.headers["cf-connecting-ip"];

 console.log("Client "+cli+" has connected");
 ws.send("Hello, "+cli+"\r\n\r\n");

 function send(d) {
  ws.send(d);
 }

 var lastkeepalive = -1;

 var encryption = false;
 var aeskey = undefined;

 var iv = undefined;

 ws.on('message', function incoming(message) {
   //console.log(Buffer.from(message).toString("hex"));
   //message=message.replace("\r","\n");

   if(encryption && typeof message === "string" && !message.startsWith("\u0010") && message!="\u0006" && message!="\u0005"){
    try {
     var dec = (decrypt(Buffer.from(message,"hex"),aeskey,iv).toString().replace("\x1E",""));
     message = dec;
    } catch (e) {
//     console.log(e);
      console.log("ERROR DECRYPTING: "+Buffer.from(message).toString("hex"));
    }
   }

//   console.log(Buffer.from(message).toString("hex"));

   if ((typeof message === 'string' || message instanceof String) && message.startsWith("\u0010")) {
    var m = message.replace("\u0010","");
    var rows = parseInt(m.split(";")[0]);
    var cols = parseInt(m.split(";")[1]);
    if (rows>=2 && cols>=10 && rows <=512 && cols <= 1500) {
     child.resize(rows, cols);
    }
    return;
   }

   if ((typeof message === 'string' || message instanceof String) && message.startsWith("\u0011")) {
    var m = message.replace("\u0011","");
    if (m == "ESTART") {
     var pk = Buffer.from(pubkey).toString("base64");
     var sc = Buffer.from(signed_crt).toString("base64");
     ws.send("\u0011EACK;"+pk+";"+sc);
    }
    if (m.startsWith("EK;")) {
     var ctxbuf = Buffer.from(m.split(";")[1],'base64');
     var t2 = Buffer.from(m.split(";")[2],'base64');
     //var t1 = crypto.privateDecrypt({key:privkey,format:'der',type:'pkcs1',padding:crypto.constants.RSA_PKCS1_PADDING}, ctxbuf);
     //var t1 = crypto.privateDecrypt({key:privkey,format:'pem',type:'pkcs8',padding:crypto.constants.RSA_PKCS1_OAEP_PADDING},ctxbuf);
     //console.log(ctxbuf.toString("base64"));
     var t1 = Buffer.from(
      crypto.privateDecrypt({key:privkey,format:'pem',padding:crypto.constants.RSA_PKCS1_PADDING},ctxbuf).toString(),
      "base64"
     );

     console.log("Got key: " + t1.toString("hex") + " and IV: "+t2.toString("hex"));
     aeskey = t1;
     iv = t2;

     ws.send("\u0011E2ACK");
    }
    if (m == "E2ENABLE") {
     console.log("Client enabled encryption with key "+aeskey.toString("hex"));

     try {
      var r = Buffer.from("1111222233334444");
      var a = encrypt(r,aeskey,iv);
      var b = decrypt(a, aeskey, iv);
      console.log("[SELF-TEST] "+r+"=>"+b.toString());
      if (r === b.toString()) {
       console.log("AES Self-test passed!");
      }
     } catch (e) {
      console.log("AES Self-test failed!!\n"+e);
     }

     encryption = true;
    }
    if (m == "E2DISABLE") {
     console.log("Client disabled encryption");
     encryption=false;
    }
    return;
   }

   if (message!="\u0006"){
    if (message=="\u0005") {

     ws.send("\u0006");
    } else {
     child.write(message);
    }
   } else {
    lastkeepalive = unix();
   }
 });

 function esend(data) {
     try {
      if (encryption) {
       var ed = data;
//       var e = encrypt(Buffer.from(ed), aeskey, iv);
//       console.log(data + " ["+data.length+" "+(typeof data)+" pl:"+ed.length+"]");
       var e = encrypt(Buffer.from(ed), aeskey, iv);
       send(Buffer.from(e).toString("hex"));
      } else {
       send(data);
      }
     }catch(e){
      console.log("ENCRYPTION ERROR "+e);
      send("<ENCRYPTION ERROR>");
     }
 }

 child.on("data", function(data) {
  esend(data);
 });

 var tid = setInterval(function(){
  ws.send("\u0005");
  if (lastkeepalive >= 0 && unix()-lastkeepalive >= 5) {
   esend("\n\n\rKeepalive timeout\n\n\r");
   console.log("Client keepalive timeout");
   child.destroy();
   ws.close();
   clearInterval(tid);
  }
 },200);

 child.on('exit', function(code) {
     esend("\n\n\r\u001b[31m\u001b[1mProcess exited with code "+code);
     ws.close();
 });

 ws.on('disconnect', function(){
   child.destroy();
   clearInterval(tid);
   console.log("Client disconnected");
 });
});

var encrypt = ((v,k,iv) => {
  var o = []; //Buffer.alloc( (16+v.length) - (v.length%16) ); //aesjs.utils.utf8.toBytes(v);
  var j = (16+v.length) - (v.length%16);

  var q = -1;
  for (let l=0;l<v.length;l++) {
   o[l] = v[l];
   q = l+1;
  }

  for(let l=q;l<j;l++) {
   o[l] = 30;
  }

  var plain = Buffer.from(o);
  var cbc = new aesjs.ModeOfOperation.cbc(k,iv);

  var e = cbc.encrypt(plain);

  return Buffer.from(e);
});

var decrypt = ((encrypted,k,iv) => {
//  console.log("K = "+Buffer.from(k).toString("hex"));
//  console.log("IV = "+Buffer.from(iv).toString("hex"));
  let decipher = crypto.createDecipheriv('aes-128-cbc', Buffer.from(k), Buffer.from(iv));
  decipher.setAutoPadding(0);
  let decrypted = decipher.update(encrypted);
  var ret =  (decrypted + decipher.final());

  var size = ret.length;

  for (v in ret) {
   if (ret[v] == "\x1E")
    size--;
  }

  var r_ = []

  var i = 0;
  for (v in ret) {
   if (ret[v] != "\x1E") {
    r_[i] = ret[v].charCodeAt(0);
    i++;
   }
  }

  return Buffer.from(r_).toString();

});
