# eDEX-UI Remote Monitoring Server (IN DEVELOPMENT/NOT WORKING YET)

Everything needed to setup a Linux server for remote monitoring with eDEX-UI.
The basic idea is that SSH'ing into a server from eDEX would allow you to see all the UI information as if you were running from said server.

This is a **work-in-progress**, not-entirely-thought-of, research pending:tm: project that I decided to make public so users interested could watch my progress. Issues and PRs are disabled until a release comes out of this.
Any questions, recommendations, ideas can be sent directly to my email: `gabriel@saillard.dev`.

---

Server security is ensured by:
 - Outright denying access to clients who do not already have an active connection pipe with the server
 - Reusing SSH keys to authentify remote monitoring requests
 - Transmitting over SSL

Current specs:

### Prerequisite

 - Server must have eDEX remote backend running as root
 - Server must have users public keys stored somewhere (tbd)
 - Client must have server's IP and corresponding SSL CA certificate in storage (also tbd)
 - Client and Server must use SSH keys auth

### Trigger
 - Client connects via ssh to server (in terminal, out of the eDEX UI scope)
 - Client detects connection and sees that the IP corresponds to an available key for monitoring
 - Client prompts user whether or not to try and initiate connection to remote monitoring, if SSH pipe is still open
 - If user confirms, connection attempt starts

### Connection
 - Client reaches server's remote monitoring websocket
 - Server looks up client's IP address in its active remote connections lists
 - If a pipe is already opened with client; proceed, otherwise, connection is terminated
 - Server sends cryptographic challenge to client (encrypt random string with SSH pubkey)
 - Client decrypts the challenge and sends it back
 - If challenge is OK, proceed to linking, otherwise, connection terminated

### Linking
 - Server forks a monitoring relay process with the permission level of the user (using setuid)
 - Once process is ready, server starts accepting monitoring requests from client
 - Client pipes all it's modules information queries to remote monitoring websocket
 - Queries are then piped by server to the correct relay process, and output is sent back encrypted with user's public key
 - Client decrypts incoming data and forwards it to modules
 - Server re-instates relay process if it ever crashes (unlikely, but failure recovery is always nice)

### Breaking up
 - (tbd - how to monitor SSH pipe?)
   - Possible solution: Monitor # of active connections with each IP, if after succesful pipe setup this number drops back to <2, close the pipe

---

Already implemented:

 - [x] Websocket server with SSH support
 - [x] Configuration file at `~/.config/eDEX-UI/RemoteServer/config.json`
 - [x] Deny connections that don't already have an active pipe (auto-whitelist)
 - [x] Parse SSH public keys and create Q-A challenges
 - [x] Managed monitoring relay processes (workers), launched with os-user perm level via `setuid`
   - [x] Serialized requests, organic processing flow via IPC (similar to eDEX multithread proxy but single-threaded)
     - Current tests show remote server overhead approx. 1ms/req
     - Performance on large-scale deployments serving monitoring to lots of eDEX clients currently untested, expected memory footprint +70M per remote connection
     - One connection, one relay process
 - [x] Single-binary, ~0 deps build output

Currently the server is only capable of processing `systeminformation` requests.
Linking client to server has been tested succesfully but there's still some work to do on connection trigger, authentication, breaking up and error handling.

**ETA before 2020**
Should be bundled with eDEX-UI v3 release.
