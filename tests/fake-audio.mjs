// A stand-in AudioContext for the browser tests, passed to context.addInitScript. It counts the
// sounds started (window.__played) and the files decoded (window.__decoded), so tests can check what
// was played.
export const FAKE_AUDIO = () => {
  window.__played = [];
  window.__decoded = 0;
  class FakeContext {
    constructor() {
      this.state = 'suspended';
      this.destination = {};
    }
    resume() {
      this.state = 'running';
      return Promise.resolve();
    }
    suspend() {
      this.state = 'suspended';
      return Promise.resolve();
    }
    createGain() {
      return { gain: { value: 1 }, connect: (n) => n };
    }
    decodeAudioData(data, ok) {
      window.__decoded++;
      ok({ bytes: data.byteLength });
    }
    createBufferSource() {
      const ctx = this;
      return {
        buffer: null,
        playbackRate: { value: 1 },
        connect: (n) => n,
        start() {
          window.__played.push({ state: ctx.state, bytes: this.buffer.bytes, rate: this.playbackRate.value });
        },
      };
    }
  }
  window.AudioContext = FakeContext;
};

