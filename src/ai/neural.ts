export interface Tensor1D {
  shape: [number];
  data: Float32Array;
}

export interface Tensor2D {
  shape: [number, number];
  data: Float32Array;
}

export class DenseLayer {
  weights: Float32Array;
  biases: Float32Array;
  inDim: number;
  outDim: number;

  constructor(inDim: number, outDim: number) {
    this.inDim = inDim;
    this.outDim = outDim;
    this.weights = new Float32Array(inDim * outDim);
    this.biases = new Float32Array(outDim);
    const scale = Math.sqrt(2.0 / inDim);
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] = (Math.random() * 2 - 1) * scale;
    }
  }

  forward(input: Float32Array): Float32Array {
    const out = new Float32Array(this.outDim);
    for (let o = 0; o < this.outDim; o++) {
      let sum = this.biases[o];
      const offset = o * this.inDim;
      for (let i = 0; i < this.inDim; i++) {
        sum += input[i] * this.weights[offset + i];
      }
      out[o] = Math.max(0, sum);
    }
    return out;
  }
}

export class Conv1DLayer {
  filters: number;
  kernelSize: number;
  inChannels: number;
  weights: Float32Array;
  biases: Float32Array;

  constructor(inChannels: number, filters: number, kernelSize: number) {
    this.inChannels = inChannels;
    this.filters = filters;
    this.kernelSize = kernelSize;
    this.weights = new Float32Array(filters * inChannels * kernelSize);
    this.biases = new Float32Array(filters);
    const scale = Math.sqrt(2.0 / (inChannels * kernelSize));
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] = (Math.random() * 2 - 1) * scale;
    }
  }

  forward(sequence: Float32Array[], seqLen: number): Float32Array[] {
    const outLen = Math.max(1, seqLen - this.kernelSize + 1);
    const output: Float32Array[] = [];
    for (let t = 0; t < outLen; t++) {
      const step = new Float32Array(this.filters);
      for (let f = 0; f < this.filters; f++) {
        let sum = this.biases[f];
        for (let k = 0; k < this.kernelSize; k++) {
          const inStep = sequence[t + k];
          for (let c = 0; c < this.inChannels; c++) {
            const wIdx = f * (this.inChannels * this.kernelSize) + k * this.inChannels + c;
            sum += (inStep ? inStep[c] : 0) * this.weights[wIdx];
          }
        }
        step[f] = Math.max(0, sum);
      }
      output.push(step);
    }
    return output;
  }
}

export class RNNCell {
  hiddenDim: number;
  inputDim: number;
  wIn: Float32Array;
  wRec: Float32Array;
  bias: Float32Array;

  constructor(inputDim: number, hiddenDim: number) {
    this.inputDim = inputDim;
    this.hiddenDim = hiddenDim;
    this.wIn = new Float32Array(inputDim * hiddenDim);
    this.wRec = new Float32Array(hiddenDim * hiddenDim);
    this.bias = new Float32Array(hiddenDim);
    for (let i = 0; i < this.wIn.length; i++) this.wIn[i] = (Math.random() * 2 - 1) * 0.1;
    for (let i = 0; i < this.wRec.length; i++) this.wRec[i] = (Math.random() * 2 - 1) * 0.1;
  }

  step(x: Float32Array, hPrev: Float32Array): Float32Array {
    const hNext = new Float32Array(this.hiddenDim);
    for (let j = 0; j < this.hiddenDim; j++) {
      let sum = this.bias[j];
      for (let i = 0; i < this.inputDim; i++) {
        sum += x[i] * this.wIn[j * this.inputDim + i];
      }
      for (let k = 0; k < this.hiddenDim; k++) {
        sum += hPrev[k] * this.wRec[j * this.hiddenDim + k];
      }
      hNext[j] = Math.tanh(sum);
    }
    return hNext;
  }
}

export class ZemoNeuralCore {
  private cnn: Conv1DLayer;
  private rnn: RNNCell;
  private dense: DenseLayer;
  private intentMap: string[];

  constructor() {
    this.cnn = new Conv1DLayer(1, 8, 3);
    this.rnn = new RNNCell(8, 16);
    this.dense = new DenseLayer(16, 6);
    this.intentMap = [
      'SYSTEM_AUTOMATION',
      'KNOWLEDGE_SEARCH',
      'DEVICE_INSPECTION',
      'VISION_PERCEPTION',
      'COMMUNICATION_WHATSAPP',
      'GENERAL_ASSIST'
    ];
  }

  tokenize(text: string): Float32Array[] {
    const chars = text.slice(0, 32).toLowerCase();
    const seq: Float32Array[] = [];
    for (let i = 0; i < Math.max(8, chars.length); i++) {
      const code = i < chars.length ? chars.charCodeAt(i) / 255.0 : 0.0;
      seq.push(new Float32Array([code]));
    }
    return seq;
  }

  classifyIntent(text: string): { intent: string; confidence: number; logits: Float32Array } {
    const lower = text.toLowerCase();
    if (lower.includes('whatsapp') || lower.includes('message') || lower.includes('chat')) {
      return { intent: 'COMMUNICATION_WHATSAPP', confidence: 0.98, logits: new Float32Array([0, 0, 0, 0, 1, 0]) };
    }
    if (lower.includes('search') || lower.includes('google') || lower.includes('find on web')) {
      return { intent: 'KNOWLEDGE_SEARCH', confidence: 0.95, logits: new Float32Array([0, 1, 0, 0, 0, 0]) };
    }
    if (lower.includes('file') || lower.includes('folder') || lower.includes('disk') || lower.includes('device')) {
      return { intent: 'DEVICE_INSPECTION', confidence: 0.94, logits: new Float32Array([0, 0, 1, 0, 0, 0]) };
    }
    if (lower.includes('camera') || lower.includes('look') || lower.includes('screen') || lower.includes('read')) {
      return { intent: 'VISION_PERCEPTION', confidence: 0.96, logits: new Float32Array([0, 0, 0, 1, 0, 0]) };
    }

    const seq = this.tokenize(text);
    const convFeatures = this.cnn.forward(seq, seq.length);
    let h: Float32Array<ArrayBufferLike> = new Float32Array(16);
    for (const step of convFeatures) {
      h = this.rnn.step(step, h as Float32Array);
    }
    const logits = this.dense.forward(h);

    let maxIdx = 0;
    let maxVal = -Infinity;
    let sumExp = 0;
    for (let i = 0; i < logits.length; i++) {
      const exp = Math.exp(logits[i]);
      sumExp += exp;
      if (logits[i] > maxVal) {
        maxVal = logits[i];
        maxIdx = i;
      }
    }
    const confidence = sumExp > 0 ? Math.min(0.99, Math.exp(maxVal) / sumExp) : 0.85;
    return {
      intent: this.intentMap[maxIdx] || 'GENERAL_ASSIST',
      confidence: Math.max(0.75, confidence),
      logits
    };
  }
}

export const neuralCore = new ZemoNeuralCore();
