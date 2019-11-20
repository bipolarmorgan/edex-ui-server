/*
 * Config storage class
 * Provides a writable object for storing configuration settings,
 * and flushes it to disk automatically 1500ms after last write,
 * or if there are more than 20 operations waiting to be flushed,
 * or when the server shuts down.
*/

class Config {
	constructor() {
		const path = require('path');
		const os = require('os');
		const fs = require('fs');

		const configPath = path.join(os.homedir(), '.config/eDEX-UI/RemoteServer');
		if (!fs.existsSync(configPath)) {
			fs.mkdirSync(configPath, {recursive: true});
		}

		this.storagePath = path.join(configPath, 'config.json');
		this.storageObject = {};
		this.defaultConfig = require('./default.config.js');
		this.writeDelay = 1500;
		this.bufferedWriteOpsCount = 0;
		this.flushTimeout = null;

		if (fs.existsSync(this.storagePath)) {
			this.storageObject = JSON.parse(fs.readFileSync(this.storagePath, {encoding: 'utf8'}));
		} else {
			this.writeDefaultConfig();
		}

		process.on('SIGINT', () => {
			this.shutdown();
		});
		process.on('SIGTERM', () => {
			this.shutdown();
		});

		return new Proxy(this.storageObject, {
			set: (target, prop, value) => {
				if (this.bufferedWriteOpsCount <= 20) {
					if (this.flushTimeout !== null) {
						clearTimeout(this.flushTimeout);
					}

					this.flushTimeout = setTimeout(() => {
						this.flush();
					}, this.writeDelay);
					this.bufferedWriteOpsCount++;
				}

				// eslint-disable-next-line no-return-assign
				return target[prop] = value;
			}
		});
	}

	async flush() {
		const fs = require('fs');
		const {promisify} = require('util');
		const write = promisify(fs.writeFile);

		await write(this.storagePath, JSON.stringify(this.storageObject, 0, 2)).catch(error => {
			throw error;
		});

		this.flushTimeout = null;
		this.bufferedWriteOpsCount = 0;
	}

	writeDefaultConfig() {
		Object.assign(this.storageObject, this.defaultConfig);
		this.flush();
	}

	shutdown() {
		const fs = require('fs');
		fs.writeFileSync(this.storagePath, JSON.stringify(this.storageObject, 0, 2));
	}
}

module.exports = Config;
