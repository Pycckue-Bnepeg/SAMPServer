import { PACKET, RPC } from './packets';
import { BitStream } from './bitstream';

const AUTH_KEY_OUT = '622125FA64F6617F';
const AUTH_KEY_IN = 'F6469B2803AEABE0A6A3C250C869C830274BFF6B';

export class Remote {
	constructor(samp, remote, slot) {
		this.remote = remote;
		this.samp = samp;
		this.state = Player.STATE_UNCONNECTED;

		this.slot = slot;
	}

	/**
		Посылает клиенту массив данных
		
		@data { Array } Массив данных для передачи
	*/
	send(data) {
		this.sendBitstream( new BitStream( new Buffer(data) ) );
	}

	/**
		Посылает клиенту пакет RPC

		@id { Number } RPC ID
		@reliability { Number }
		@data { BitStream } Данные для передачи
	*/
	sendRpc(id, reliability, data) {
		let packet = {
			id: PACKET.RPC,
			reliability: reliability,
			messageId: this.lastMessageId
		};

		let bitstream = new BitStream();

		bitstream.writeUInt8(id);

		if (data !== undefined) {
			let length = new Buffer(4);
			length.writeUInt32LE(data.buffer.length << 3);
			bitstream.writeCompressed(length, 32, true);
			bitstream.writeBytes(data.buffer, data.buffer.length);
			bitstream.writeUInt8(0x00);
		}

		this.sendPacket(packet, bitstream);
	}

	/**
		Посылает клиенту пакет

		@packetOrId { Object | Number }
			-> Object ( id, reliability [, orderIndex] [, orderChannel] ) Параметры пакета
			-> Number ID пакета
		@dataOrReliability { BitStream | Number }
			-> BitStream Данные для передачи
			-> Number Reliability пакета
		@_data { BitStream } Данные для передачи (Не нужен, если первый параметр является Object)
	*/
	sendPacket(packetOrId, dataOrReliability, _data) {
		let packet;

		if (Number.isInteger(packetOrId)) {
			packet = {
				id: packetOrId,
				reliability: dataOrReliability
			};
		}
		else {
			_data = dataOrReliability || new BitStream();
			packet = packetOrId;
		}

		if (packet.messageId === void(0))
			packet.messageId = this.lastMessageId || 0x0000;

		let bitstream = this.samp.handler.packetToBitstream(packet, _data.buffer);
		this.sendBitstream(bitstream);
	}

	/**
		Отправляет клиенту BitStream

		@bitstream { BitStream } Битстрим данных для передачи
	*/
	sendBitstream(bitstream) {
		let buffer = bitstream.buffer;
		this.samp.server.send(buffer, 0, buffer.length, this.remote.port, this.remote.address, function(err) { if (err) throw err });
		console.log(buffer);
		this.lastMessageId++;
	}

	/**
		Блокировка доступа клиента к серверу

		@reason { String } Причина блокировки
	*/
	ban(reason) {
		console.log(`ban ${reason}`);
		this.samp.players.addToBanlist(this, reason);
		this.kick(Player.REASON_KICKED);
	}

	/**
		Отсоединение клиента от сервера и удаление его из пула игроков
	*/
	disconnect() {
		this.state = Player.STATE_UNCONNECTED;
		this.samp.players.remove(this);
	}

	/**
		Закрытие соединения сервера с клиентом

		@reason { Number (extend PlayerPool):
			REASON_BANNED = 0
			REASON_KICKED = 1 
		} Причина закрытия соединения
	*/
	kick(reason) {
		switch (reason) {
			case Player.REASON_BANNED: 
				return this.send([ PACKET.CONNECTION_BANNED ]);
			
			case Player.REASON_KICKED: {
				return this.sendPacket({ 
					id: PACKET.DISCONNECTION_NOTIFICATION,
					reliability: 9,
					orderChannel: 0x00,
					orderIndex: 0x00
				});
			}
		}

		this.disconnect();
	}

	/**
		Callback запроса соединения
	*/
	onConnectionRequest() {
		if (this.state === Player.STATE_UNCONNECTED) {
			if (this.slot === -1) {
				this.send([ PACKET.NO_FREE_INCOMING_CONNECTIONS ]);
				this.disconnect();
			}
			else {
				this.state = Player.STATE_CONNECTING;

				this.send([ PACKET.OPEN_CONNECTION_REPLY ]);
			}
		}
		else
			this.ban('Client is connected');
	}

	/**
		Callback принятия RPC

		@packet { Object ( hasAcks, messageId, reliability, length, id, data, isSplit, rpcId, rpcData, rpcDataLength ) } Принятый пакет от клиента
	*/
	onReceiveRpc(packet) {
		this.lastMessageId = packet.messageId;
		
		switch (packet.rpcId) {
			case RPC.CLIENT_JOIN: {
				let version = packet.data.readInt32();
				let mod = packet.data.readUInt8();
				let nameLength = packet.data.readUInt8();
				let name = packet.data.readString(nameLength);
				let response = packet.data.readUInt32();
				let authLength = packet.data.readUInt8();
				let auth = packet.data.readBytes(authLength);

				if (this.playerId === -1)
					return this.rejectConnection(Player.REJECT_REASON_BAD_PLAYERID);
				
				if (name.match(/[^\w]+/))
					return this.rejectConnection(Player.REJECT_REASON_BAD_NICKNAME);

				this.state = Player.STATE_CONNECETED;
				this.name = name;

				this.samp.players.initGameForPlayer(this);

				return;
			}

			default:
				return console.log(packet);
		}
	}

	/**
		Callback принятия пакета

		@packet { Object ( hasAcks, messageId, reliability, length, id, data, isSplit ) } Принятый пакет от клиента
	*/
	onReceivePacket(packet) {
		this.lastMessageId = packet.messageId;

		switch (packet.id) {
			case PACKET.CONNECTION_REQUEST: {
				let bitstream = new BitStream();

				bitstream.writeUInt8(AUTH_KEY_OUT.length);
				bitstream.writeString(AUTH_KEY_OUT);

				return this.sendPacket(PACKET.AUTHKEY, 8, bitstream);
			}

			case PACKET.AUTHKEY: {
				if (packet.data.buffer.slice(1).toString() == AUTH_KEY_IN) {
					let bitstream = new BitStream();

					bitstream.appendBuffer( new Buffer([ 127, 0, 0, 1 ]), 32 );
					bitstream.writeUInt16(this.samp.port);
					bitstream.writeUInt16(this.slot);
					bitstream.writeUInt32(0xECAFA15C);

					return this.sendPacket(PACKET.CONNECTION_REQUEST_ACCEPTED, 8, bitstream);
				}
				else
					return this.ban('False AuthKey');
			}
		}
	}

	/**
		Получения IP адреса клиента

		@return { String } IP адрес
	*/
	get address() {
		return this.remote.address;
	}

	/**
		Проверяет заблокирован ли клиент на сервере

		@return { Bool } Статус блокировки
	*/
	isBanned() {
		return this.samp.players.isBanned(this.address);
	}

	/**
		Отправка сообщения клиенту в чат

		@color { Number } Цвет сообщения
		@text { String } Текст сообщения
	*/

	// TODO: Осилить русские символы
	sendMessage(color, text) {
		let data = new BitStream();

		data.writeUInt32(color);
		data.writeUInt32(text.length);
		data.writeString(text);
		
		this.sendRpc(RPC.CLIENT_MESSAGE, 8, data);
	}

	/**
		Отклонение подключения при RPC Client Join
		
		@reason { Numbre (extend PlayerPool): 
			REJECT_REASON_BAD_VERSION = 1
			REJECT_REASON_BAD_NICKNAME = 2
			REJECT_REASON_BAD_MOD = 3
			REJECT_REASON_BAD_PLAYERID = 4
		} Причина отклонения подключения
	*/
	rejectConnection(reason) {
		let data = new BitStream();
		data.writeUInt8(reason);

		this.sendRpc(RPC.CONNECTION_REJECTED, 8, data);
	}

	/**
		Получение ID игрока

		@return { Number } ID игрока
	*/
	get playerId() {
		return this.slot;
	}
}

export class Player extends Remote {
	constructor(samp, player) {
		super(samp, player.remote, player.slot);

		this.state = Player.STATE_INGAME;
	}
}

export class PlayerPool {
	constructor(samp) {
		this.samp = samp;
		this.players = new Array(this.samp._settings.maxplayers);

		this.loadBanlist();
	}

	/**
		Авторизация нового игрока на сервере
		
		@remote { Object (address, port etc) } Информация о клиенте
	*/
	authNewPlayer(remote) {
		let player = this.isConnected(remote.address);

		if (player)
			return player;
		else {
			let slot = this.getFreeSlot();

			if (slot !== -1)
				this.players[slot] = new Remote(this.samp, remote, slot);
			else 
				(new Remote(this.samp, remote, slot)).onConnectionRequest();
			
			return this.players[slot];
		}
	}

	/**
		Проверяет подключен ли игрок к серверу

		@return { Remote | Boolean }
			-> Remote Возвращается в случае, если игрок подключен
			-> Boolean (false) ... если игрока нет
	*/
	isConnected(ip) {
		for (let remote of this.players)
			if (remote !== void(0) && ip == remote.address)
				return remote;

		return false;
	}
	
	/**
		Удаление игрока из пула игроков

		@player { Remote } Игрок, которого необходимо удалить
	*/
	remove(player) {
		let index = this.players.indexOf(player);

		if (index > -1)
			this.players[index] = void(0);
	}

	/**
		Проверяет забанен ли игрок на сервере (находится ли его IP в бан-листе)

		@return { Boolean } Статус блокировки
	*/
	isBanned(ip) {
		return ip in this.banlist;
	}

	/**
		Загрузка бан-листа сервера
	*/

	// TODO: Сделать загрузку из файла
	loadBanlist() {
		this.banlist = {
			//'127.0.0.1': 'Cheats'
		};
	}

	/**
		Добавление игрока в бан-лист

		@player { Remote } Игрок, которого необходимо добавить в бан-лист
		@reason { String } Причина добавления в бан-лист
	*/

	// TODO: Сделать сохранение бан-листа
	addToBanlist(player, reason) {
		this.banlist[player.address] = reason;
	}

	/**
		Получение свободного слота для игрока

		@return { Number } Слот (-1, если нет места)
	*/
	getFreeSlot() {
		for (let i = 0; i < this.players.length; i++)
			if (this.players[i] == void(0))
				return i;
		return -1;
	}

	/**
		Инициализация игрового мира для игрока

		@player { Remote } Игрок, запрашивающий инициализацию (После инициализации становится классом Player)
	*/
	initGameForPlayer(player) {
		let bs = new BitStream();

		bs.writeBit(1); // zone names
		bs.writeBit(0); // use cj walk
		bs.writeBit(1); // allow weapons
		bs.writeBit(0); // limit global chat
		bs.writeFloat(200.0); // chat radius
		bs.writeBit(0); // stunt bonus
		bs.writeFloat(70.0); // nametags distance
		bs.writeBit(1); // disable enter/exit pickups
		bs.writeBit(1); // nametag los
		bs.writeBit(1); // manual vehicle engine and lights
		bs.writeInt32(0x01); // spawns avilable
		bs.writeUInt16(player.playerId);
		bs.writeBit(1); // show player tags
		bs.writeInt32(1); // show player markers
		bs.writeUInt8(12); // world time
		bs.writeUInt8(10); // weather
		bs.writeFloat(0.8); // gravity
		bs.writeBit(0); // lan mode
		bs.writeInt32(0); // death drop money
		bs.writeBit(0); // instagib

		bs.writeInt32(40); // onfoot send rate
		bs.writeInt32(40); // incar ...
		bs.writeInt32(40); // firing ...
		bs.writeInt32(10); // send multiplier

		bs.writeUInt8(0x01); // lag compensation

		bs.writeUInt8(0); // unk
		bs.writeUInt8(0); // unk
		bs.writeUInt8(0); // unk

		let name = this.samp._settings.hostname;
		bs.writeUInt8(name.length);
		bs.writeString(name);

		let veh = new Buffer(212);
		veh.fill(1);

		bs.writeBytes(veh, 212);

		player.sendRpc(RPC.INIT_GAME, 8, bs);

		this.players[player.slot] = new Player(this.samp, player);
	}

	/**
		Получение кол-ва игроков на сервере

		@return { Number } Кол-во игроков
	*/
	get length() {
		let length = 0;

		for (let i = 0; i < this.players.length; i++)
			if (this.players[i] != void(0))
				length++;

		return length;
	}
}

// 
Player.REASON_BANNED = 0;
Player.REASON_KICKED = 1;

//
Player.STATE_UNCONNECTED = 0;
Player.STATE_CONNECTING = 1;
Player.STATE_CONNECETED = 2;
Player.STATE_INGAME = 3;

//
Player.REJECT_REASON_BAD_VERSION = 1;
Player.REJECT_REASON_BAD_NICKNAME = 2;
Player.REJECT_REASON_BAD_MOD = 3;
Player.REJECT_REASON_BAD_PLAYERID = 4;