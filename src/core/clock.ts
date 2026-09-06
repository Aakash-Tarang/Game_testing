export class Ticker {
  private interval: number | null = null
  private cb: (dt: number) => void
  private cadence: number
  private last: number = 0

  constructor(cb: (dt: number) => void, cadenceMs: number) {
    this.cb = cb
    this.cadence = cadenceMs
  }

  start() {
    this.last = performance.now()
    this.interval = window.setInterval(() => {
      const now = performance.now()
      const dt = now - this.last
      this.last = now
      this.cb(dt)
    }, this.cadence)
  }

  stop() {
    if (this.interval !== null) {
      clearInterval(this.interval)
      this.interval = null
    }
  }

  setCadence(ms: number) {
    this.cadence = ms
    if (this.interval !== null) {
      this.stop()
      this.start()
    }
  }
}
