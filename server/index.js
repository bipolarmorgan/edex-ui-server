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
 * Suppress logs on production
*/
if (process.env.NODE_ENV === 'production' && !process.argv.includes('--debug')) {
	console.log = () => {
		return true;
	};
}

/*
 * require() calls
*/
const os = require('os');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const systeminformation = require('systeminformation');

const wsHelpers = require('./helpers/comms.js');
const Config = require('./config/config-storage.class.js');
const AutoWhitelist = require('./security/auto-whitelist.class.js');
const WorkerManager = require('./workers/manager.class.js');

/*
 * Load config
*/
const config = new Config();
const configPath = path.join(os.homedir(), '.config/eDEX-UI/RemoteServer');

/*
 * Request validation
*/
const validReqTypes = [
	// eDEX Remote-specific functions
	'version'
].concat(Object.keys(systeminformation)); // Concat with functions provided by dependencies

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
async function validateConn(ws, _) {
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
async function authConn(ws, _) {
	// TODO

	ws.worker = await workerManager.spawnWorker('/home/squared', 1000, 1000).catch(error => {
		throw error;
	});

	ws.on('close', () => {
		workerManager.killWorker(ws.worker.id);
	});

	console.log(`Worker ${ws.worker.id} created`);

	if (ws.readyState !== 1) {
		throw new Error('break');
	}
}

// Start event loop
async function pipeConn(ws, _) {
	ws.on('message', async msg => {
		const data = JSON.parse(msg);
		// console.log('request data:', data);

		if (typeof data.type === 'string' && typeof data.args === 'object' && validReqTypes.includes(data.type)) {
			ws.worker.processReq(data).then(res => {
				ws.send(JSON.stringify(res, 0, 2));
			}).catch(error => {
				console.log(`Worker ${ws.worker.id} errored on '${error.req.type}' request (#${error.req.id}):\n${error.message}`);
			});
		} else {
			ws.send('Bad request');
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
let httpServer;

if (config.useSSL) {
	httpServer = require('https').createServer({
		key: fs.readFileSync(configPath + '/key.pem'),
		cert: fs.readFileSync(configPath + '/cert.pem')
	});
} else {
	httpServer = require('http').createServer();
}

const wss = new WebSocket.Server({port: config.port, server: httpServer});

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
		.then(() => wsHelpers.wrap(ws))
		.then(() => authConn(ws, req))
		.then(() => pipeConn(ws, req))
		.catch(_ => {
			// Connection has already been closed with an appropriate error status
			// in one of the promises above.
			// Now we just need to terminate the socket pipe,
			// otherwise malicious clients could keep the connection open and send
			// more data.
			ws.terminate();
		});
});

/*
 * Log server address & port - even in production
*/
process.stdout.write(`eDEX-UI Remote Monitoring Server listening at ${(typeof wss.address() === 'string') ? wss.address : wss.address().address + ':' + wss.address().port}\n`);

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
