/* WorkerManager class
 * Creates and manages worker child processes.
*/
class WorkerManager {
	constructor() {
		this.nanoid = require('nanoid');
		this.workers = {};
		this.workerBinPath = require('path').join(__dirname, 'worker');
		this.workerTargetPath = '/tmp/edexrworker';

		this.cleanTmp();
		process.on('SIGINT', () => {
			this.cleanTmp();
		});
		process.on('SIGTERM', () => {
			this.cleanTmp();
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

		const worker = require('child_process').spawn(this.workerTargetPath, [], {
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

		worker.on('error', error => {
			throw error;
		});

		worker.processReq = req => {
			return new Promise((resolve, reject) => {
				worker.stdout.once('data', res => {
					try {
						resolve(JSON.parse(res));
					} catch (error) {
						reject(error);
					}
				});

				worker.stdin.write(JSON.stringify(req));
			});
		};

		this.workers[id] = worker;

		return this.workers[id];
	}

	killWorker(id) {
		if (!this.workers[id]) {
			throw new Error('No worker to kill.');
		}

		this.workers[id].once('exit', () => {
			delete this.workers[id];
		});
		process.kill(-this.workers[id].pid);
	}
}

module.exports = WorkerManager;
