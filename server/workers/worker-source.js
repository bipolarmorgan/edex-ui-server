/*
 * Worker source
 * This is compiled to a `worker` binary (`npm run build-worker` will do it for you)
 * Workers are spawned and managed by the WorkerManager (/workers/manager.class.js)
 * They process information requests piped from a remote eDEX-UI client.
*/

const si = require('systeminformation');

process.stdin.setEncoding('utf-8');
process.stdin.resume();

process.on('message', req => {
	si[req.type](...req.args).then(res => {
		req.res = res;
		req.success = true;
		process.send(req);
	}).catch(error => {
		req.res = error;
		req.success = false;
		process.send(req);
	});
});

process.on('SIGINT', () => {
	process.exit(0);
});
