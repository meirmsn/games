// A stand-in AudioContext for the browser tests, passed to context.addInitScript. It counts the
// sounds started (window.__played), the files decoded (window.__decoded) and keeps the sources made
// (window.__sources), so tests can check what was played and how.
export const FAKE_AUDIO = () => {
  window.__played = [];
  window.__decoded = 0;
  window.__sources = []; // every buffer source made, so a test can read a playing loop's rate
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
      const src = {
        buffer: null,
        playbackRate: { value: 1 },
        connect: (n) => n,
        start() {
          window.__played.push({ state: ctx.state, bytes: this.buffer.bytes, rate: this.playbackRate.value });
        },
        stop() {},
      };
      window.__sources.push(src);
      return src;
    }
  }
  window.AudioContext = FakeContext;
};

