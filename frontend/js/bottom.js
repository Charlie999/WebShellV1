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

var term = new Terminal();

var socket = new WebSocket('wss://gw.charliespve.ml/ws');

 var attachAddon = new AttachAddon(socket);
 var fitAddon = new FitAddon.FitAddon();
 var webLinksAddon = new WebLinksAddon();

var connected = false;

var latency = new Queue();

setInterval(function(){
 switch(socket.readyState) {
  case 0:
   connected = false;
   document.getElementById("status").innerHTML = "Connecting";
   document.getElementById("status").style.color = "orange";
   break;
  case 1:
   connected = true;
   document.getElementById("status").innerHTML = "Connected";
   document.getElementById("status").style.color = "green";
   break;
  case 2:
  case 3:
   connected = false;
   document.getElementById("status").innerHTML = "Disconnected";
   document.getElementById("status").style.color = "red";
   break;
 }
 if (connected) {
  document.getElementById("encryption_status").innerHTML = isEncrypted(socket)?"ENCRYPTED":"UNENCRYPTED";
  document.getElementById("encryption_status").style.color = isEncrypted(socket)?"green":"red";

  if (Date.now()%1000 <= 10) {
   if (attachAddon._latency >= 0) {
    latency.enqueue(attachAddon._latency);
   }
   while (latency.elements.length > 5) {
    latency.dequeue();
   }
  }
  document.getElementById("latency").innerHTML = (latency.elements.reduce((a, b) => a + b, 0)/5)+"ms";
 } else {
  document.getElementById("latency").innerHTML = "N/A";

  document.getElementById("encryption_status").innerHTML = "UNENCRYPTED";
  document.getElementById("encryption_status").style.color = "red";
 }
 document.getElementById("terminal").style.height = Math.floor(window.innerHeight - document.getElementById("footer").offsetHeight - 20)+"px";
},10);

setInterval(function(){
 fitAddon.fit();
},100);

term.write("Connecting..\r\n");

term.loadAddon(fitAddon);
term.loadAddon(webLinksAddon);
term.loadAddon(attachAddon);

term.open(document.getElementById('terminal'));
fitAddon.fit();

setInterval(function(){
 if(connected)
  attachAddon._socket.send("\u0010"+term.cols+";"+term.rows);
 document.getElementById("termsize").innerHTML = term.cols+"x"+term.rows;
},500);

function reportWindowSize() {
 fitAddon.fit();
 attachAddon._socket.send("\u0010"+term.cols+";"+term.rows);
 document.getElementById("termsize").innerHTML = term.cols+"x"+term.rows;
}

document.getElementById("termsize").innerHTML = term.cols+"x"+term.rows;

window.onresize = reportWindowSize;
