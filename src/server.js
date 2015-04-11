import { PlayerPool, Player } from './players';
import { PacketHandler, PACKET, RPC } from './packets';

export class SAMPServer {
	/**
	*/
	constructor(maxplayers = 100, port = 7777, autorun = true) {
		this.port = port;

		this._settings = {
			hostname: 'poshol nahooy',
			gamemode: '',
			map: '',
			password: '',
			maxplayers: maxplayers
		};

		this.rules = new Object();
		this.players = new PlayerPool(this);

		if (autorun)
			this.run();
	}

	/**
	*/
	set(name, value) {
		if (name in this._settings)
			this._settings[name] = value;
		else
			throw new Error(`Настройки ${name} не существует.`);
	}

	/**
	*/
	rule(name, value) {
		this.rules[name] = value;
	}

	/**
	*/
	run() {
		let dgram = require('dgram');

		this.server = dgram.createSocket('udp4');

		this.server.on('listening', () => console.log('SAMP Server has been started'));
		this.server.on('message', this.onReceiveMessage.bind(this));

		this.server.bind(this.port);

		this.handler = new PacketHandler(this);
	}

	/**
	*/
	onReceiveMessage(message, remote) {
		if (message.length >= 4 && message.slice(0, 4) == 'SAMP')
			this.handler.onBrowserRequest(message, remote);
		else {
			let decode = this.handler.decodePacket(message);
			let player = this.players.authNewPlayer(remote);

			if (player.isBanned())
				return player.kick(Player.REASON_BANNED);

			if (decode[0] === PACKET.OPEN_CONNECTION_REQUEST) {
				if (player.state === Player.STATE_UNCONNECTED && decode.length === 3 && (decode.readInt16LE(1) ^ 6969) === this.port)
					return player.onConnectionRequest();
				else
					return player.ban('Хей');
			}
			else {
				let packet = this.handler.parsePacket(decode);

				if (packet.success) {
					if (packet.id === PACKET.RPC)
						return player.onReceiveRpc(packet);
					else
						return player.onReceivePacket(packet);
				}
			}
		}
	}
}