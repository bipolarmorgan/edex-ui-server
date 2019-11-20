const WebSocket = require('ws');

process.stdin.setEncoding('utf-8');

const wsc = new WebSocket('ws://127.0.0.1:8000');

wsc.on('close', (code, reason) => {
	process.stdout.write(`\n\nConnection closed: ${code} ${reason}\n`);
	process.exit(0);
});

wsc.on('error', error => {
	process.stdout.write(`\n\nERROR\n${JSON.stringify(error, 0, 2)}\n`);
	process.exit(1);
});

wsc.on('message', data => {
	process.stdout.write(`\n↓ RECEIVED:\n${data}\n> `);
});

wsc.once('open', () => {
	process.stdout.write('Connected to 127.0.0.1:8000\n\n > ');
	process.stdin.resume();

	process.stdin.on('data', async chunk => {
		process.stdin.pause();
		chunk = chunk.trim();

		if (chunk === '.exit') {
			wsc.close();
			process.exit(0);
		}

		let payload = JSON.stringify({
			type: (chunk.includes('(')) ? chunk.slice(0, chunk.indexOf('(')) : chunk,
			args: (chunk.includes('(')) ? chunk.slice(chunk.indexOf('(')+1, chunk.length-1).split(', ') : []
		});

		wsc.send(payload);
		process.stdout.write(`↑> ${payload}`);

		process.stdin.resume();
	});
});

process.on('SIGINT', () => {
	process.stdout.write('\nReceived SIGINT\n');
	process.exit(0);
});
