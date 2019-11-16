/*
 * ---------------------------------
 * eDEX-UI Remote Monitoring Server
 * Licensed under GPL-3.0
 * © Copyright 2019 Gabriel SAILLARD
 * --
 * See package.json for up to date
 * external URLs (author, git, etc)
 * ---------------------------------
*/

/*
 * require() calls
*/
const WebSocket = require('ws');
const AutoWhitelist = require('./security/auto-whitelist.class.js');
const WorkerManager = require('./workers/manager.class.js');

/*
 * Request validation
*/
const validReqTypes = [
	'cpu'
];

/*
 * Load security & authentication modules
*/
const autoWhitelist = new AutoWhitelist();

/*
 * Load jail subprocesses manager
*/
const workerManager = new WorkerManager();

/*
 * Define socket connections handlers
*/

// Validate connection requests - kind of like a firewall
async function validateConn(ws, req) {
	// Check that remote is in the active connections whitelist
	await autoWhitelist.check(ws.addr).then(passed => {
		console.log(`Whitelist check: ${passed}`);
		if (!passed) {
			ws.close(4403, 'Access denied');
		}
	}).catch(error => {
		ws.close(4400, error.message);
	});

	if (ws.readyState !== 1) {
		throw new Error('break');
	}
}

// Authenticate user
async function authConn(ws, req) {
	// TODO

	if (ws.readyState !== 1) {
		throw new Error('break');
	}
}

// Start event loop
async function pipeConn(ws, req) {
	ws.worker = await workerManager.spawnWorker('/home/squared', 1000, 1000).catch(error => {
		throw error;
	});

	ws.on('message', async msg => {
		console.log(msg);
		ws.send('Got: ' + msg);

		const data = JSON.parse(msg);
		console.log('request data:', data);

		if (typeof data.type === 'string' && typeof data.args === 'object') {
			ws.worker.processReq(data).then(res => {
				ws.send(JSON.stringify(res, 0, 2));
			}).catch(error => {
				throw error;
			});
		}
	});

	console.log('Pipe activated');

	if (ws.readyState !== 1) {
		throw new Error('break');
	}
}

/*
 * Initiate websocket server
*/
const wss = new WebSocket.Server({port: 8000});

wss.on('connection', async (ws, req) => {
	// Store remote IP address in connection object
	ws.addr = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
	ws.addr = ws.addr.trim();

	// Log connections
	console.log(`\nNew connection from ${ws.addr}`);
	ws.once('close', () => {
		console.log(`Connection with ${ws.addr} terminated`);
	});

	validateConn(ws, req)
		.then(() => authConn(ws, req))
		.then(() => pipeConn(ws, req))
		.catch(error => {
			console.log(error);
			// Connection has already been closed with an appropriate error status
			// in one of the promises above.
			// Now we just need to terminate the socket pipe,
			// otherwise malicious clients could keep the connection open and send
			// more data.
			ws.terminate();
		});
});

/*
 * Log server address & port
*/
console.log(`eDEX-UI Remote Monitoring Server listening at ${(typeof wss.address() === 'string') ? wss.address : wss.address().address + ':' + wss.address().port}`);

/*
 * Graceful server shutdown function
*/
function shutdown() {
	return new Promise((resolve, reject) => {
		if (wss) {
			wss.close(error => {
				if (error) {
					reject();
				} else {
					resolve();
				}
			});
		}
	});
}

/*
 * Signals handlers
*/

async function gracefulExit() {
	await shutdown().catch(() => {
		process.exit(1);
	});

	process.exit(0);
}

process.on('SIGINT', gracefulExit);
process.on('SIGTERM', gracefulExit);
