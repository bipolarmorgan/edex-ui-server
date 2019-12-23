/*
 * Communication (WS transport) helpers
*/

module.exports = {
	queryWrap(ws) {
		ws.query = async function (...args) {
			const time = new Promise((resolve, reject) => {
				setTimeout(() => reject(new Error('Query timed out')), 10 * 1000);
			});

			const answer = new Promise(resolve => {
				ws.once('message', msg => {
					resolve(msg);
				});
				ws.send(...args);
			});

			return Promise.race([time, answer]);
		};

		return ws;
	},
	wrap(ws) {
		return this.queryWrap(ws);
	}
};
