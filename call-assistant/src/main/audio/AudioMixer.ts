const TARGET_SAMPLE_RATE = 16000

export class AudioMixer {
  private frameSize: number
  private accum: Float64Array
  private accumCount = 0
  private active = new Set<string>()
  private listener: ((frame: Int16Array) => void) | null = null
  private levelListener: ((db: number) => void) | null = null
  private interval: NodeJS.Timeout | null = null

  constructor(frameMs = 40) {
    this.frameSize = Math.round((TARGET_SAMPLE_RATE * frameMs) / 1000)
    this.accum = new Float64Array(this.frameSize)
  }

  setListener(cb: (frame: Int16Array) => void): void {
    this.listener = cb
  }

  setLevelListener(cb: (db: number) => void): void {
    this.levelListener = cb
  }

  addSource(id: string): void {
    this.active.add(id)
    this.ensureTimer()
  }

  removeSource(id: string): void {
    this.active.delete(id)
  }

  feed(id: string, pcm: Int16Array): void {
    if (!this.active.has(id)) return
    console.log('[AudioMixer] feed:', id, pcm.length, 'samples, accumCount:', this.accumCount)
    for (let i = 0; i < pcm.length; i++) {
      if (this.accumCount < this.frameSize) {
        this.accum[this.accumCount] += pcm[i]
        this.accumCount++
      } else {
        this.flush()
        this.accum[this.accumCount] += pcm[i]
        this.accumCount++
      }
    }
  }

  private ensureTimer(): void {
    if (this.interval) return
    this.interval = setInterval(() => {
      if (this.accumCount >= this.frameSize) {
        this.flush()
      }
    }, 40)
  }

  private flush(): void {
    if (!this.listener || this.accumCount === 0) return
    const out = new Int16Array(this.accumCount)
    let sumSq = 0
    for (let i = 0; i < this.accumCount; i++) {
      let v = this.accum[i]
      this.accum[i] = 0
      if (v > 32767) v = 32767
      else if (v < -32768) v = -32768
      out[i] = Math.round(v)
      sumSq += out[i] * out[i]
    }
    if (this.levelListener) {
      const rms = Math.sqrt(sumSq / this.accumCount) / 32768
      const db = rms > 1e-8 ? 20 * Math.log10(rms) : -60
      this.levelListener(Math.max(-60, Math.min(0, db)))
    }
    this.accumCount = 0
    this.listener(out)
  }

  clear(): void {
    this.accum.fill(0)
    this.accumCount = 0
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval)
      this.interval = null
    }
    this.active.clear()
    this.clear()
  }
}
