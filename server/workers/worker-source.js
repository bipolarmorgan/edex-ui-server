/*
 * Worker source
 * This is compiled to a `worker` binary (`npm run build-worker` will do it for you)
 * Workers are spawned and managed by the WorkerManager (/workers/manager.class.js)
 * They process information requests piped from a remote eDEX-UI client.
 * Request validation is done in the server thread so workers have pretty much zero
 * error handling.
*/

const si = require('systeminformation');

process.stdin.setEncoding('utf-8');
process.stdin.resume();

process.stdin.on('data', async req => {
	req = JSON.parse(req);
	const res = await si[req.type](...req.args);
	process.stdout.write(JSON.stringify(res)+'--END');
});

process.on('SIGINT', () => {
	process.exit(0);
});
