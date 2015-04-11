export class BitStream {
	constructor(bytes) {
		this.buffer = bytes || new Buffer( [ 0x00 ] );
		this.offset = 0;
	}

	seekTo(offset) {
		if (offset > this.buffer.length * 8)
			this.addBits(offset - (this.buffer.length * 8));

		this.offset = offset;
	}

	ignoreBits(length) {
		this.seekTo(this.offset + length);
	}

	align() {
		this.offset += 8 - ( (( this.offset - 1 ) & 7) + 1 );
	}

	addBits(bits) {
		if (bits >= 8)
			this.addBytes(bits >> 3);

		if ((( bits & 7 ) > ( 8 - ( this.offset & 7 ) )) || (this.offset + bits > (this.buffer.length << 3)))
			this.addBytes(1);
	}

	addBytes(bytes) {
		this.buffer = Buffer.concat([ 
			this.buffer, 
			new Buffer( new Array(bytes) ) 
		]);
	}

	readBit() {
		let value = (this.buffer[this.offset >> 3] & (0x80 >> (this.offset & 7))) >> (7 - (this.offset & 7));
		this.offset++;
		return value;
	}

	readByte(length = 8) {
		if ( ( length + this.offset ) > this.buffer.length * 8 )
			throw new Error(`Невозможно получить ${length} бит, т.к выходит за пределы буфера`);

		let value = 0;

		for (let i = 0; i < length; i++)
			value |= this.readBit() << ( (length - 1) - i );

		return value;
	}

	readBits(length) {
		let lengthInBytes = length >> 3;
		let lengthMod8 = length & 7;

		if (lengthMod8 === 0 && (this.offset & 7) === 0) {
			let output = new Buffer(lengthInBytes);
			this.buffer.copy(output, 0, this.offset >> 3, (this.offset >> 3) + lengthInBytes);
			this.offset += length;
			return output;
		}

		let output = new Buffer(( lengthMod8 > 0 ) ? lengthInBytes + 1 : lengthInBytes);

		for (let i = 0; i < lengthInBytes; i++)
			output[i] = this.readByte();

		if (lengthMod8 > 0)
			output[lengthInBytes] = this.readByte(lengthMod8);

		return output;
	}

	readBytes(length) {
		return this.readBits(length << 3);
	}

	writeBit(on) {
		if (on === 1)
			this.buffer[this.offset >> 3] |= 0x80 >> (this.offset & 7);
		else
			this.buffer[this.offset >> 3] &= ~( 0x80 >> (this.offset & 7) );

		this.offset++;
	}

	writeByte(value, length = 8) {
		this.addBits(length);

		if (( this.offset & 7 ) === 0) {
			this.buffer[this.offset >> 3] = (value >> (8 - length)) << ( 8 - length );
			this.offset += length;

			return;
		}
		
		for (let i = (8 - length); i < 8; i++) {
			this.writeBit(
				( value & ( 0x80 >> i ) ) >> ( 7 - i )
			);
		}
	}

	writeBits(buffer, length) {
		let lengthInBytes = length >> 3;
		let lengthMod8 = length & 7;

		if (lengthMod8 === 0 && (this.offset & 7) === 0) {
			this.appendBuffer(buffer, length);
			return;
		}

		for (let i = 0; i < lengthInBytes; i++)
			this.writeByte(buffer[i]);
		if (lengthMod8 > 0)
			this.writeByte(buffer[lengthInBytes], lengthMod8);
	}

	writeBytes(buffer, length = buffer.length) {
		this.writeBits(buffer, length << 3);
	}

	appendBuffer(buffer, size) {
		if (this.offset === 0 && this.buffer.length === 1 && this.buffer[0] === 0x00)
			this.buffer = buffer;
		else
			this.buffer = Buffer.concat([ this.buffer, buffer.slice(0, size << 3) ]);
		this.offset += size;
	}

	writeBitstream(bitstream) {
		this.appendBuffer(bitstream.buffer, bitstream.buffer.length * 8);
	}

	writeString(string) {
		if ((this.offset & 7) === 0) {
			this.addBytes(string.length);
			this.buffer.write(string, this.offset >> 3, string.length, 'ascii');
			this.offset += string.length * 8;
			return;
		}
		else {
			for (let i = 0; i < string.length; i++)
				this.writeByte(string.charCodeAt(i));
		}
	}

	readString(length) {
		if (length > this.buffer.length)
			throw new Error(`Невозможно выполнить чтение строки из буфера, т.к размер строки выше размера буфера.`);

		return this.readBits(length * 8).toString('ascii');
	}

	writeInt8(value, length = 8) {
		let buffer = new Buffer(1);
		buffer.writeInt8(value);
		this.writeBits(buffer, length);
	}

	writeUInt8(value, length = 8) {
		let buffer = new Buffer(1);
		buffer.writeUInt8(value);
		this.writeBits(buffer, length);
	}

	writeInt16(value, length = 16) {
		let buffer = new Buffer(2);
		buffer.writeInt16LE(value);
		this.writeBits(buffer, length);
	}

	writeUInt16(value, length = 16) {
		let buffer = new Buffer(2);
		buffer.writeUInt16LE(value);
		this.writeBits(buffer, length);
	}

	writeInt32(value, length = 32) {
		let buffer = new Buffer(4);
		buffer.writeInt32LE(value);
		this.writeBits(buffer, length);
	}

	writeUInt32(value, length = 32) {
		let buffer = new Buffer(4);
		buffer.writeUInt32LE(value);
		this.writeBits(buffer, length);
	}

	writeFloat(value, length = 32) {
		let buffer = new Buffer(4);
		buffer.writeFloatLE(value);
		this.writeBits(buffer, length);
	}

	writeVector3D(value) {
		this.writeFloat(value.x);
		this.writeFloat(value.y);
		this.writeFloat(value.z);
	}

	writeCompressed(input, length, unsignedData) {
		let currentByte = ( length >> 3 ) - 1;
		let byteMatch = unsignedData ? 0x00 : 0xFF;

		while ( currentByte > 0 ) {
			this.addBits(1);

			if ( input[ currentByte ] === byteMatch )
				this.writeBit(1);
			else {
				this.writeBit(0);
				this.writeBits(input, ( currentByte + 1 ) << 3);
				return;
			}
			currentByte--;
		}

		this.addBits(1);

		if ( ( unsignedData && ( input[currentByte] & 0xF0 ) === 0x00 ) ||
			( unsignedData === false && ( input[currentByte] & 0xF0 ) === 0xF0 ) ) {
			this.writeBit(1);
			this.writeByte(input[currentByte], 4);
		}
		else {
			this.writeBit(0);
			this.writeByte(input[currentByte], 8);
		}
	}

	readInt8(length = 8) {
		return this.readBits(length).readInt8(0);
	}

	readUInt8(length = 8) {
		return this.readBits(length).readUInt8(0);
	}

	readInt16(length = 16) {
		return this.readBits(length).readInt16BE(0);
	}

	readUInt16(length = 16) {
		return this.readBits(length).readUInt16BE(0);
	}

	readInt32(length = 32) {
		return this.readBits(length).readInt32BE(0);
	}

	readUInt32(length = 32) {
		return this.readBits(length).readUInt32BE(0);
	}

	readFloat(length = 32) {
		return this.readBits(length).readFloatBE(0);
	}

	readVector3D() {
		return {
			x: this.readFloat(),
			y: this.readFloat(),
			z: this.readFloat()
		};
	}

	readCompressed(length, unsignedData) {
		let output = new Buffer(length >> 3);
		let currentByte = ( length >> 3 ) - 1;
		let byteMatch = unsignedData ? 0x00 : 0xFF;
		let halfByteMatch = unsignedData ? 0x00 : 0xF0;

		while ( currentByte > 0 ) {
			if (this.readBit() === 1) {
				output[currentByte] = byteMatch;
				currentByte--;
			}
			else {
				this.readBits(( currentByte + 1 ) << 3 ).copy(output);
				return output;
			}
		}
		
		if (this.readBit() === 1) {
			this.readBits(4).copy(output, currentByte);
			output[currentByte] |= halfByteMatch;
		}
		else
			this.readBits(8).copy(output, currentByte);
		return output;
	}
}