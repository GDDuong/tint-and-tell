import type { Socket } from 'socket.io-client';
import { isPttKey, isSpeechFrame, type Prefs } from './prefs';

export type VoiceStatus = 'connecting' | 'on' | 'failed';
export type PeerInfo = { id: number; name: string };

type SignalData =
  | { type: 'offer'; sdp: RTCSessionDescriptionInit }
  | { type: 'answer'; sdp: RTCSessionDescriptionInit }
  | { type: 'candidate'; candidate: RTCIceCandidateInit };

type Peer = {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  name: string;
  polite: boolean;
  makingOffer: boolean;
};

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

function isTypingTarget(event: KeyboardEvent): boolean {
  const el = event.target as HTMLElement | null;
  return (
    !!el &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' ||
      el.isContentEditable)
  );
}

export class VoiceSession {
  private socket: Socket;
  private youId: number;
  private prefs: Prefs;
  private onStatus: (status: VoiceStatus) => void;
  private peers = new Map<number, Peer>();
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private outTrack: MediaStreamTrack | null = null;
  private boost: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private frame: Uint8Array<ArrayBuffer> | null = null;
  private vadTimer = 0;
  private quietFrames = 0;
  private speaking = false;
  private pttHeld = false;
  private muted = false;
  private deafened = false;
  private stopped = false;

  constructor(
    socket: Socket,
    youId: number,
    prefs: Prefs,
    onStatus: (status: VoiceStatus) => void,
  ) {
    this.socket = socket;
    this.youId = youId;
    this.prefs = prefs;
    this.onStatus = onStatus;
  }

  async start(others: PeerInfo[]) {
    // Listen before awaiting the mic: the first offer can race getUserMedia.
    this.socket.on('voice:signal', this.onSignal);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: this.prefs.inputId ? { deviceId: { exact: this.prefs.inputId } } : true,
      });
    } catch {
      this.socket.off('voice:signal', this.onSignal);
      this.onStatus('failed');
      return;
    }
    if (this.stopped) {
      this.stream.getTracks().forEach((track) => track.stop());
      return;
    }
    this.buildAudioChain(this.stream);
    for (const other of others) this.ensurePeer(other.id, other.name);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    this.vadTimer = window.setInterval(this.vadTick, 80);
    this.onStatus('on');
  }

  private buildAudioChain(stream: MediaStream) {
    this.ctx = new AudioContext();
    const source = this.ctx.createMediaStreamSource(stream);
    this.boost = this.ctx.createGain();
    this.boost.gain.value = this.prefs.micBoost / 100;
    const destination = this.ctx.createMediaStreamDestination();
    source.connect(this.boost);
    this.boost.connect(destination);
    this.outTrack = destination.stream.getAudioTracks()[0];
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.boost.connect(this.analyser);
    this.frame = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
  }

  stop() {
    this.stopped = true;
    window.clearInterval(this.vadTimer);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    this.socket.off('voice:signal', this.onSignal);
    for (const peer of this.peers.values()) {
      peer.pc.close();
      peer.audio.srcObject = null;
    }
    this.peers.clear();
    this.stream?.getTracks().forEach((track) => track.stop());
    void this.ctx?.close();
  }

  configure(prefs: Prefs) {
    const inputChanged = prefs.inputId !== this.prefs.inputId;
    this.prefs = prefs;
    if (this.boost) this.boost.gain.value = prefs.micBoost / 100;
    if (inputChanged && this.stream) void this.switchInput();
    this.applyMic();
    this.applyVolumes();
  }

  private async switchInput() {
    try {
      const next = await navigator.mediaDevices.getUserMedia({
        audio: this.prefs.inputId ? { deviceId: { exact: this.prefs.inputId } } : true,
      });
      if (this.stopped) {
        next.getTracks().forEach((track) => track.stop());
        return;
      }
      this.stream?.getTracks().forEach((track) => track.stop());
      this.stream = next;
      this.buildAudioChain(next);
      if (this.outTrack) {
        for (const peer of this.peers.values()) {
          const sender = peer.pc.getSenders().find((entry) => entry.track?.kind === 'audio');
          void sender?.replaceTrack(this.outTrack);
        }
      }
      this.applyMic();
    } catch {
      // Keep the previous mic when the new one can't be opened.
    }
  }

  syncPlayers(others: PeerInfo[]) {
    const wanted = new Map(others.map((other) => [other.id, other.name]));
    for (const [id, peer] of this.peers) {
      if (!wanted.has(id)) {
        peer.pc.close();
        peer.audio.srcObject = null;
        this.peers.delete(id);
      }
    }
    for (const [id, name] of wanted) {
      this.ensurePeer(id, name);
    }
    this.applyVolumes();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    this.applyMic();
  }

  setDeafened(deafened: boolean) {
    this.deafened = deafened;
    this.applyMic();
    this.applyVolumes();
  }

  private ensurePeer(id: number, name: string): Peer {
    const existing = this.peers.get(id);
    if (existing) {
      existing.name = name;
      return existing;
    }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const peer: Peer = {
      pc,
      audio: document.createElement('audio'),
      name,
      polite: this.youId > id,
      makingOffer: false,
    };
    if (this.outTrack) pc.addTrack(this.outTrack, new MediaStream([this.outTrack]));
    peer.audio.autoplay = true;
    pc.ontrack = (event) => {
      peer.audio.srcObject = event.streams[0];
      this.applyVolume(id);
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendSignal(id, { type: 'candidate', candidate: event.candidate.toJSON() });
      }
    };
    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription(await pc.createOffer());
        if (pc.localDescription) this.sendSignal(id, { type: 'offer', sdp: pc.localDescription });
      } catch {
        // Peer closed mid-negotiation; syncPlayers will reap it.
      } finally {
        peer.makingOffer = false;
      }
    };
    this.peers.set(id, peer);
    return peer;
  }

  private sendSignal(to: number, data: SignalData) {
    this.socket.emit('voice:signal', { to, data });
  }

  private onSignal = (payload: { from: number; data: SignalData }) => {
    void this.handleSignal(payload.from, payload.data);
  };

  private async handleSignal(from: number, data: SignalData) {
    if (this.stopped) return;
    const peer = this.ensurePeer(from, String(from));
    try {
      if (data.type === 'candidate') {
        await peer.pc.addIceCandidate(data.candidate);
        return;
      }
      const collision =
        data.type === 'offer' &&
        (peer.makingOffer || peer.pc.signalingState !== 'stable');
      if (collision && !peer.polite) {
        // Glare: yield by rolling back our own offer, then take theirs.
        if (peer.pc.signalingState === 'have-local-offer') {
          await peer.pc.setLocalDescription({ type: 'rollback' });
        } else {
          return; // mid-renegotiation; our in-flight offer will settle it
        }
      }
      await peer.pc.setRemoteDescription(data.sdp);
      if (data.type === 'offer') {
        await peer.pc.setLocalDescription(await peer.pc.createAnswer());
        if (peer.pc.localDescription) {
          this.sendSignal(from, { type: 'answer', sdp: peer.pc.localDescription });
        }
      }
    } catch {
      // Stale candidate or interleaved signal; the peer connection recovers on
      // the next negotiation.
    }
  }

  private onKeyDown = (event: KeyboardEvent) => {
    if (isTypingTarget(event) || this.prefs.voiceMode !== 'ptt') return;
    if (isPttKey(event, this.prefs.pttKey)) {
      event.preventDefault();
      if (!this.pttHeld) {
        this.pttHeld = true;
        this.applyMic();
      }
    }
  };

  private onKeyUp = (event: KeyboardEvent) => {
    if (this.prefs.voiceMode !== 'ptt') return;
    if (isPttKey(event, this.prefs.pttKey)) {
      this.pttHeld = false;
      this.applyMic();
    }
  };

  private vadTick = () => {
    if (!this.analyser || !this.frame || this.prefs.voiceMode !== 'vad') return;
    this.analyser.getByteTimeDomainData(this.frame);
    let peak = 0;
    for (const value of this.frame) {
      const distance = Math.abs(value - 128);
      if (distance > peak) peak = distance;
    }
    if (isSpeechFrame(peak, this.prefs.micSensitivity)) {
      this.quietFrames = 0;
      if (!this.speaking) {
        this.speaking = true;
        this.applyMic();
      }
    } else if (this.speaking) {
      // Hangover: a few quiet frames before muting so speech doesn't clip.
      this.quietFrames += 1;
      if (this.quietFrames >= 6) {
        this.speaking = false;
        this.applyMic();
      }
    }
  };

  private micShouldFlow(): boolean {
    if (this.muted || this.deafened || !this.outTrack) return false;
    return this.prefs.voiceMode === 'ptt' ? this.pttHeld : this.speaking;
  }

  private applyMic() {
    if (!this.outTrack) return;
    this.outTrack.enabled = this.micShouldFlow();
  }

  private applyVolume(id: number) {
    const peer = this.peers.get(id);
    if (!peer) return;
    const sink = peer.audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
    if (this.prefs.outputId && typeof sink.setSinkId === 'function') {
      void sink.setSinkId(this.prefs.outputId).catch(() => {});
    }
    if (peer.audio.srcObject) {
      const playerVol = (this.prefs.playerVols[peer.name] ?? 100) / 100;
      const base = (this.prefs.masterVol / 100) * (this.prefs.voiceVol / 100);
      peer.audio.volume = Math.min(1, Math.max(0, this.deafened ? 0 : base * playerVol));
    }
  }

  private applyVolumes() {
    for (const id of this.peers.keys()) this.applyVolume(id);
  }
}
