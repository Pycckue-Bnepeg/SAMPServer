import { SAMPServer } from './server';

let server = new SAMPServer(666);

server.rule('version', '0.4a-RC1');

/*

process.stdin.setEncoding('utf8');

process.stdin.on('readable', () => {
	let chunk = process.stdin.read();
	if (chunk != void(0)) {
		let cmd = chunk.slice(0, chunk.length - 2);
		console.log(`entered cmd: '${cmd}'`);
	}
});

*/