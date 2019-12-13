/*
 * User class
 * Represents an authenticated OS-level user.
*/
class User {
	constructor(home, uid, gid, key) {
		// TODO
	}
}

/*
 * PubKey class
 * Reads, parses and provides a usable node-rsa key object
 * from a ssh-rsa PEM-encoded public key file.
*/
class PubKey {
	constructor(path) {
		const Rsa = require('node-rsa');
		const fs = require('fs');

		/* eslint-disable no-multi-spaces */
		let key = Buffer.from(
			fs.readFileSync(path, {encoding: 'utf8'})    // Read .pub key
				.split(' ')[1]                            // Trim ssh-rsa prefix and comments
			, 'base64');                                 // Decode base64 body

		// Deconstruct 'key' buffer step-by-step
		// More info:
		// https://tools.ietf.org/html/rfc4253#section-6.6
		let length = key.readUInt32BE();                // Get 4 bytes length prefix from beginning of buffer...
		const format = key.subarray(4, 4 + length)      // ...and get format identifier...
			.toString('ascii');                          // ...which is an ascii-encoded string

		if (format !== 'ssh-rsa') {
			throw new Error('Unsupported key format');   // (throw error if format isn't supported)
		}

		key = key.subarray(4 + length);                 // Trim original key buffer for next steps

		length = key.readUInt32BE();                    // Get next length prefix
		const e = key.subarray(4, 4 + length);          // Read RSA exponent (e)

		key = key.subarray(4 + length);                 // Trim key buffer again

		length = key.readUInt32BE();                    // Get final length prefix
		const n = key.subarray(4, 4 + length);          // Read RSA modulus (n)

		key = key.subarray(4 + length);                 // Trim key buffer, should now be empty

		if (key.length > 0) {
			throw new Error('Key is too long');          // (throw if there's data left after deconstruction)
		}

		/* eslint-enable no-multi-spaces */

		// Construct node-rsa public key object
		key = new Rsa();
		key.importKey({
			e: e.readIntBE(0, e.length),
			n
		}, 'components-public');

		this.key = key;
	}

	getQAchallenge() {
		if (!this.key) {
			throw new Error('Key not available');
		}

		const nanoid = require('nanoid');
		this.challenge = nanoid();

		return this.key.encrypt(this.challenge);
	}

	checkQAresponse(res) {
		if (!this.challenge) {
			throw new Error('No stored challenge');
		}

		return (res.toString('ascii') === this.challenge);
	}
}

/*
 * Authenticator class
 * Authenticates remote monitoring requests,
 * match them with OS-level users.
*/
class Authenticator {
	constructor() {
		const fs = require('fs');
		const os = require('os');
		const path = require('path');
		this.rootHomeDir = '/home';

		if (os.type() !== 'Linux') {
			throw new Error('Unsupported OS');
		}
	}

	auth() {

	}
}

module.exports = Authenticator;
