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
		this.loop = new EventEmitter();

		this.cp = Cp.spawn(path, [], {
			cwd,
			uid,
			gid,
			detached: true,
			stdio: [
				'pipe',
				'pipe',
				'pipe',
				'ipc'
			]
		});

		this.cp.on('exit', () => {
			this.dead = true;
		});
		this.cp.on('error', error => {
			throw error;
		});

		this.cp.on('message', data => {
			this.msgListener(data);
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

	msgListener(req) {
		if (req.success) {
			this.loop.emit(req.id + '-res', req);
		} else {
			this.loop.emit(req.id + '-err', req);
		}
	}

	processReq(req) {
		return new Promise((resolve, reject) => {
			if (this.dead) {
				reject(new Error('Worker child process is dead!'));
			}

			if (!req.id) {
				req.id = this.nanoid();
			}

			this.loop.once(req.id + '-res', req => {
				this.loop.removeAllListeners(req.id + '-err');
				resolve(req.res);
			});

			this.loop.once(req.id + '-err', req => {
				this.loop.removeAllListeners(req.id + '-res');

				const err = new Error(req.res);
				delete req.res;
				err.req = req;
				reject(err);
			});

			this.cp.send(req);
		});
	}
}

/*
 * WorkerManager class
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
