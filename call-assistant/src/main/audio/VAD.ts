export class VoiceActivityDetector {
  private speaking = false
  private holdUntil = 0

  constructor(
    private thresholdDb = -42,
    private holdMs = 700
  ) {}

  process(pcm: Int16Array, now: number): boolean {
    if (pcm.length === 0) return this.speaking
    let sum = 0
    for (let i = 0; i < pcm.length; i++) {
      const s = pcm[i]
      sum += s * s
    }
    const rms = Math.sqrt(sum / pcm.length) / 32768
    const db = rms > 1e-8 ? 20 * Math.log10(rms) : -120
    if (db > this.thresholdDb) {
      this.speaking = true
      this.holdUntil = now + this.holdMs
    } else if (now > this.holdUntil) {
      this.speaking = false
    }
    return this.speaking
  }

  get isSpeaking(): boolean {
    return this.speaking
  }

  reset(): void {
    this.speaking = false
    this.holdUntil = 0
  }
}
