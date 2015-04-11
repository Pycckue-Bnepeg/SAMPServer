import { decode } from './decoder';
import { BitStream } from './bitstream';

export const PACKET = {
	CONNECTION_REQUEST: 12,
	AUTHKEY: 13,
	RPC: 22,
	OPEN_CONNECTION_REQUEST: 25,
	OPEN_CONNECTION_REPLY: 26,
	NEW_INCOMING_CONNECTION: 31,
	NO_FREE_INCOMING_CONNECTIONS: 32,
	DISCONNECTION_NOTIFICATION: 33,
	CONNECTION_REQUEST_ACCEPTED: 35,
	CONNECTION_BANNED: 37
};

export const RPC = {
	CLIENT_JOIN: 25,
	CLIENT_MESSAGE: 93,
	CONNECTION_REJECTED: 130,
	INIT_GAME: 139
};

export class PacketHandler {
	/**
	*/
	constructor(samp) {
		this.samp = samp;
	}

	/**
	*/
	decodePacket(data) {
		return decode(data, this.samp.port, 0);
	}

	/**
	*/
	parsePacket(data) {
		let stream = new BitStream(data);

		try {
			let packet = {
				success: true,
				hasAcks: stream.readUInt8(1),
				messageId: stream.readUInt16(),
				reliability: stream.readUInt8(4),
			};

			if (packet.reliability === 7 || packet.reliability === 9 || packet.reliability === 10) {
				packet.orderChannel = stream.readUInt8(5);
				packet.orderIndex = stream.readUInt16();
			}

			packet.isSplit = stream.readUInt8(1);

			if (packet.isSplit) {
				packet.splitId = stream.readUInt16();
				packet.splitIndex = stream.readUInt32();
				packet.splitCount = stream.readUInt32();
			}
			packet.length = stream.readCompressed(16, true).readUInt16LE(0) >> 3;

			stream.align();

			packet.id = stream.readUInt8();
			packet.data = new BitStream(stream.buffer.slice( (stream.offset >> 3) ));

			if (packet.id === PACKET.RPC) {
				packet.rpcId = packet.data.readUInt8();

				if (packet.data.buffer.length > 1) {
					packet.rpcDataLength = packet.data.readCompressed(32, true).readUInt32LE(0) >> 3;
				}
			}

			return packet;
		}

		catch (error) {
			console.log('\nError:', ' Parse Internal Packet');
			console.log('\t', error);
			console.log('\t', data);
			console.log('\t', packet);
			console.log('End.\n');
			
			return { success: false };
		}
	}

	/**
	*/
	packetToBitstream(packet, data) {
		let bitstream = new BitStream();

		bitstream.writeBit(0); // has acks
		bitstream.writeUInt16(packet.messageId || 0x0001); // messageId
		bitstream.writeUInt8(packet.reliability, 4); // reliability

		if (packet.reliability === 7 || packet.reliability === 9 || packet.reliability === 10) {
			bitstream.writeUInt8(packet.orderChannel, 5);
			bitstream.writeUInt16(packet.orderIndex);
		}

		bitstream.writeBit(packet.isSplit || 0);

		if (packet.isSplit === 1) {
			bitstream.writeUInt16(packet.splitId);
			bitstream.writeUInt32(packet.splitIndex);
			bitstream.writeUInt32(packet.splitCount);
		}
		let length = new Buffer(2);
		length.writeUInt16LE(((data !== undefined) ? (data.length << 3) : 0x0000));

		bitstream.writeCompressed(length, 16, true);

		bitstream.align();

		bitstream.writeUInt8(packet.id);
		
		if (data !== undefined)
			bitstream.appendBuffer(data, data.length << 3);

		return bitstream;
	}

	/**
	*/
	onBrowserRequest(message, remote) {

	}
}