# Charlie-WebShell
# Copyright (C) 2021 Charlie999
#
# This program is free software: you can redistribute it and/or modify
# it under the terms of the GNU General Public License as published by
# the Free Software Foundation, either version 3 of the License, or
# (at your option) any later version.
#
# This program is distributed in the hope that it will be useful,
# but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
# GNU General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with this program.  If not, see <http://www.gnu.org/licenses/>.

#!/usr/bin/env python3

# THIS SHOULD NEVER BE PUT ON THE PUBLIC INTERNET, FOR OBVIOUS REASONS.

# root.crt + root.key is a self-signed cert with which I can manually verify the e2ee clientside.

import cgi,base64,os,tempfile,subprocess
form = cgi.FieldStorage();

c = (form.getvalue("cert"));

if (c==None):
 print("HTTP/1.1 400 Bad request")
 print("")
 print("Bad request")
 exit()

print("HTTP/1.1 200 OK")
print("")

nf, fn = tempfile.mkstemp();

os.write(nf, base64.b64decode(c))

CMDLINE = "openssl x509 -req -days 30 -in {CSR} -CA root.crt -CAkey root.key -CAcreateserial -sha256"
os.system("chmod 777 "+fn);

sp = subprocess.Popen(CMDLINE.replace("{CSR}",fn), shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
print(sp.stdout.read().decode())

print("\n=CA=")
with open("root.crt","r") as f:
 print(f.read())

os.close(nf)
