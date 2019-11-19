/*
 * Worker class
 * Represents a worker child process.
*/
class Worker {
	constructor(path, cwd, uid, gid) {
		const Cp = require('child_process');
		const {EventEmitter} = require('events');
		this.nanoid = require('nanoid/non-secure');

		this.dead = false;
		this.queue = [];
		this.currentReq = null;
		this.loop = new EventEmitter();

		this.cp = Cp.spawn(path, [], {
			cwd,
			uid,
			gid,
			detached: true,
			stdio: [
				'pipe',
				'pipe',
				'pipe'
			]
		});

		this.cp.on('exit', () => {
			this.dead = true;
		});

		this.cp.stdout.on('data', data => {
			this.dataListener(data);
		});
		this.cp.on('error', error => {
			this.errorListener(error);
		});
		this.cp.stderr.on('data', data => {
			this.errorListener(data);
		});

		return new Proxy(this, {
			get: (instance, prop) => {
				if (prop in instance) {
					return instance[prop];
				}
				return instance.cp[prop];
			}
		});
	}

	dataListener(buffer) {
		buffer = buffer.toString();

		if (buffer.endsWith('}--END')) {
			buffer = buffer.slice(0, -5);

			let id = this.currentReq._id;
			let raw = this.currentReq._res+buffer;

			this.currentReq = null;
			this.wakeup();

			try {
				let data = JSON.parse(raw);

			console.log(`req ${id} DONE`);
				this.loop.emit(id+'-res', data);
			} catch (error) {
			console.log(`req ${ID} ERROR`);
				this.loop.emit(id+'-err', error);
			}
		} else {
			this.currentReq._res += buffer;
		}
	}

	errorListener(error) {
		if (typeof error === 'object') {
			error = error.toString();
		}

		this.loop.emit(this.currentReq._id+'-err', error);

		this.currentReq = null;
		this.wakeup();
	}

	wakeup() {
		if (!this.currentReq && this.queue.length > 0) {
			this.currentReq = this.queue.shift();
			this.currentReq._res = '';

			if (this.currentReq.type === 'processes') {
				console.log(`req ${this.currentReq._id} DENIED ${this.currentReq.type}`);
				this.currentReq = null;
				this.wakeup();
				return;
			}

		console.log(`req ${this.currentReq._id} PROCESSING ${this.currentReq.type}`);
			this.cp.stdin.write(JSON.stringify(this.currentReq));
		}
	}

	processReq(req) {
		return new Promise((resolve, reject) => {

			if (this.dead) {
				reject(new Error('Worker child process is dead!'));
			}

			req._id = this.nanoid();

			this.loop.once(req._id+'-res', res => {
				this.loop.removeAllListeners(req._id+'-err');
				resolve(res);
			});

			this.loop.once(req._id+'-err', error => {
				this.loop.removeAllListeners(req._id+'-res');

				reject([req._id, req.type, error]);
			});

			this.queue.push(req);
			this.wakeup();
		});
	}

	finishRequest() {
		let id = this.currentReq._id;
		let raw = this.currentReq._res;

		this.currentReq = null;
		this.wakeup();

		try {
			let data = JSON.parse(raw);

			this.loop.emit(id+'-res', data);
		} catch (error) {
			this.loop.emit(id+'-err', error);
		}
	}
}

/* WorkerManager class
 * Copies the worker binary from the bundle to /tmp
 * to allow for `spawn` syscalls.
 * Creates and manages workers.
 * Forward requests to workers and returns the results.
*/
class WorkerManager {
	constructor() {
		this.nanoid = require('nanoid');
		this.workers = {};
		this.workerBinPath = require('path').join(__dirname, 'worker');
		this.workerTargetPath = '/tmp/edexrworker';

		this.cleanTmp();

		process.on('SIGINT', () => {
			this.shutdown();
		});
		process.on('SIGTERM', () => {
			this.shutdown();
		});
	}

	cleanTmp() {
		const fs = require('fs');

		if (fs.existsSync(this.workerTargetPath)) {
			fs.unlinkSync(this.workerTargetPath);
		}
	}

	async writeWorkerBin() {
		const fs = require('fs');
		const {promisify} = require('util');

		const chmod = promisify(fs.chmod);

		function copy(src, target) {
			return new Promise((resolve, reject) => {
				const stream = fs.createReadStream(src).pipe(fs.createWriteStream(target));

				stream.on('finish', () => {
					resolve();
				});

				stream.on('error', error => {
					reject(error);
				});
			});
		}

		await copy(this.workerBinPath, this.workerTargetPath);
		await chmod(this.workerTargetPath, 0o765);
	}

	async spawnWorker(cwd, uid, gid) {
		const id = this.nanoid();
		this.workers[id] = {reserved: true};

		if (!require('fs').existsSync(this.workerTargetPath)) {
			await this.writeWorkerBin();
		}

		const worker = new Worker(this.workerTargetPath, cwd, uid, gid);

		worker.on('error', error => {
			throw error;
		});

		worker.id = id;

		this.workers[id] = worker;

		worker.once('exit', () => {
			delete this.workers[id];
		});

		return this.workers[id];
	}

	killWorker(id) {
		if (!this.workers[id]) {
			throw new Error('No worker to kill.');
		}

		process.kill(-this.workers[id].pid);
	}

	shutdown() {
		this.cleanTmp();
		Object.keys(this.workers).forEach(id => {
			this.killWorker(id);
		});
	}
}

module.exports = WorkerManager;
