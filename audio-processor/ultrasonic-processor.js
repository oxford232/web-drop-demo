import "../library/ggwave.js"
import {
    TRANS_INIT,
    TRANS_INIT_SUCCESS,
    TRANS_RECV_MSG,
    TRANS_SEND_MSG,
    TRANS_SEND_MSG_DONE
} from "./transport-type.js"

class UltrasonicProcessor extends AudioWorkletProcessor {
    constructor() {
        super();
        this.handleMessage = this.handleMessage.bind(this);
        this.port.onmessage = this.handleMessage;
        this.sendBufferIndex = 0;
        this.receiveBufferOffset = 0;
        this.receiveBuffer = new Float32Array(1024);
    }

    handleMessage(e) {
        const { data } = e;
        switch (data.type) {
            case TRANS_INIT:
                this.init(data.sampleRate).catch((e) => {
                    console.error(e);
                })
                break;

            case TRANS_SEND_MSG: {
                this.send(data.message);
                break;
            }

            default:
                console.log('unknown action');
        }
    }

    async init(sampleRate = 48000) {
        this.ggwave = await ggwave_factory();
        const parameters = this.ggwave.getDefaultParameters();
        console.log("parameters: ", parameters);
        parameters.sampleRateInp = sampleRate;
        parameters.sampleRateOut = sampleRate;
        this.ggwaveIns = this.ggwave.init(parameters);
        this.port.postMessage({
            type: TRANS_INIT_SUCCESS
        })
    }

    convertTypedArray(src, type) {
        const buffer = new ArrayBuffer(src.byteLength);
        new src.constructor(buffer).set(src);
        return new type(buffer);
    }

    send(text) {
        const waveform = this.ggwave.encode(this.ggwaveIns, text, this.ggwave.ProtocolId.GGWAVE_PROTOCOL_ULTRASOUND_FAST, 10);
        this.sendBuffer = this.convertTypedArray(waveform, Float32Array);
        // const buffer = this.audioContext.createBuffer(1, buf.length, this.audioContext.sampleRate);
        // buffer.getChannelData(0).set(buf);
        // const source = this.audioContext.createBufferSource();
        // source.buffer = buffer;
        // source.connect(this.audioContext.destination);
        // source.start(0);
    }



    process(input, output) {
        // console.log('process: ', input[0][0]);

        if (this.sendBuffer) {
            // console.log('process: ', output[0]);
            const len = output[0][0].length;
            const endIndex = this.sendBufferIndex + len < this.sendBuffer.length ? this.sendBufferIndex + len : this.sendBuffer.length;
            output[0][0].set(this.sendBuffer.subarray(this.sendBufferIndex, endIndex));
            if (endIndex === this.sendBuffer.length) {
                this.sendBuffer = null;
                this.sendBufferIndex = 0;
                this.port.postMessage({
                    type: TRANS_SEND_MSG_DONE
                })
            } else {
                this.sendBufferIndex = endIndex;
            }
        }

        if (input[0][0]) {
            this.receiveBuffer.set(input[0][0], this.receiveBufferOffset);
            this.receiveBufferOffset += input[0][0].length;
            if (this.receiveBufferOffset === 1024) {
                const res = this.ggwave.decode(this.ggwaveIns, this.convertTypedArray(this.receiveBuffer, Int8Array));

                if (res && res.length > 0) {
                    console.log("receive data: ", res);
                    const buffer = res.slice();
                    buffer.set(res);
                    this.port.postMessage({
                        type: TRANS_RECV_MSG,
                        buffer,
                    })
                }
                this.receiveBufferOffset = 0;
            }
        }
        return true;
    }
}

registerProcessor("ultrasonic-processor", UltrasonicProcessor);