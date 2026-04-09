export class AudioEffectManager {
  private audioContext: AudioContext | null = null
  private masterGain: GainNode | null = null
  private isEnabled = true
  private volume = 0.3

  constructor() {
    void this.initAudioContext()
  }

  private async initAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
      this.masterGain = this.audioContext.createGain()
      this.masterGain.connect(this.audioContext.destination)
      this.masterGain.gain.value = this.volume
    } catch {
      this.audioContext = null
      this.masterGain = null
    }
  }

  playSingleRainDropIntoWaterSound() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const ctx = this.audioContext
    const t = ctx.currentTime

    const out = ctx.createGain()
    out.gain.setValueAtTime(1, t)
    out.connect(this.masterGain)

    const tone = ctx.createOscillator()
    tone.type = 'sine'
    tone.frequency.setValueAtTime(1180, t)
    tone.frequency.exponentialRampToValueAtTime(260, t + 0.11)

    const toneGain = ctx.createGain()
    toneGain.gain.setValueAtTime(0.0001, t)
    toneGain.gain.exponentialRampToValueAtTime(0.1, t + 0.004)
    toneGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)

    const toneLP = ctx.createBiquadFilter()
    toneLP.type = 'lowpass'
    toneLP.frequency.setValueAtTime(2400, t)
    toneLP.frequency.exponentialRampToValueAtTime(900, t + 0.08)
    toneLP.Q.setValueAtTime(0.8, t)

    const noiseBuffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 0.03)), ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    }

    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer

    const splashBP = ctx.createBiquadFilter()
    splashBP.type = 'bandpass'
    splashBP.frequency.setValueAtTime(1750, t)
    splashBP.Q.setValueAtTime(12, t)

    const splashGain = ctx.createGain()
    splashGain.gain.setValueAtTime(0.0001, t)
    splashGain.gain.exponentialRampToValueAtTime(0.04, t + 0.002)
    splashGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045)

    tone.connect(toneGain)
    toneGain.connect(toneLP)
    toneLP.connect(out)

    noise.connect(splashBP)
    splashBP.connect(splashGain)
    splashGain.connect(out)

    tone.start(t)
    tone.stop(t + 0.16)
    noise.start(t)
    noise.stop(t + 0.05)
  }

  setEnabled(enabled: boolean) {
    this.isEnabled = enabled
  }

  setVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, volume))
    if (this.masterGain) {
      this.masterGain.gain.value = this.volume
    }
  }

  private ensureReady() {
    if (!this.isEnabled || !this.audioContext || !this.masterGain) return false
    if (this.audioContext.state === 'suspended') {
      void this.audioContext.resume()
    }
    return true
  }

  playClickSound() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const oscillator = this.audioContext.createOscillator()
    const gainNode = this.audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(this.masterGain)

    oscillator.frequency.setValueAtTime(800, this.audioContext.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(400, this.audioContext.currentTime + 0.1)

    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1)

    oscillator.start(this.audioContext.currentTime)
    oscillator.stop(this.audioContext.currentTime + 0.1)
  }

  playNiceClickSoundB() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const ctx = this.audioContext
    const now = ctx.currentTime

    const body = ctx.createOscillator()
    body.type = 'triangle'
    body.frequency.setValueAtTime(520, now)
    body.frequency.exponentialRampToValueAtTime(280, now + 0.06)

    const overtone = ctx.createOscillator()
    overtone.type = 'sine'
    overtone.frequency.setValueAtTime(1040, now)
    overtone.frequency.exponentialRampToValueAtTime(620, now + 0.05)

    const toneGain = ctx.createGain()
    toneGain.gain.setValueAtTime(0.0001, now)
    toneGain.gain.exponentialRampToValueAtTime(0.22, now + 0.003)
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.11)

    const toneLP = ctx.createBiquadFilter()
    toneLP.type = 'lowpass'
    toneLP.frequency.setValueAtTime(2200, now)
    toneLP.Q.setValueAtTime(0.7, now)

    const noiseBuffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 0.02)), ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    }

    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer

    const noiseBP = ctx.createBiquadFilter()
    noiseBP.type = 'bandpass'
    noiseBP.frequency.setValueAtTime(1400, now)
    noiseBP.Q.setValueAtTime(12, now)

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.0001, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.05, now + 0.002)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03)

    const out = ctx.createGain()
    out.gain.setValueAtTime(1, now)
    out.connect(this.masterGain)

    body.connect(toneGain)
    overtone.connect(toneGain)
    toneGain.connect(toneLP)
    toneLP.connect(out)

    noise.connect(noiseBP)
    noiseBP.connect(noiseGain)
    noiseGain.connect(out)

    body.start(now)
    overtone.start(now)
    noise.start(now)

    body.stop(now + 0.12)
    overtone.stop(now + 0.09)
    noise.stop(now + 0.04)
  }

  playNiceClickSoundA() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const ctx = this.audioContext
    const now = ctx.currentTime

    const osc1 = ctx.createOscillator()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(1050, now)
    osc1.frequency.exponentialRampToValueAtTime(820, now + 0.045)

    const osc2 = ctx.createOscillator()
    osc2.type = 'sine'
    osc2.frequency.setValueAtTime(1580, now)
    osc2.frequency.exponentialRampToValueAtTime(1180, now + 0.04)

    const toneGain = ctx.createGain()
    toneGain.gain.setValueAtTime(0.0001, now)
    toneGain.gain.exponentialRampToValueAtTime(0.16, now + 0.002)
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09)

    const toneHP = ctx.createBiquadFilter()
    toneHP.type = 'highpass'
    toneHP.frequency.setValueAtTime(520, now)
    toneHP.Q.setValueAtTime(0.7, now)

    const noiseBuffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 0.015)), ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    }

    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer

    const noiseHP = ctx.createBiquadFilter()
    noiseHP.type = 'highpass'
    noiseHP.frequency.setValueAtTime(4200, now)
    noiseHP.Q.setValueAtTime(0.9, now)

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.0001, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.03, now + 0.001)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.02)

    const out = ctx.createGain()
    out.gain.setValueAtTime(1, now)
    out.connect(this.masterGain)

    osc1.connect(toneGain)
    osc2.connect(toneGain)
    toneGain.connect(toneHP)
    toneHP.connect(out)

    noise.connect(noiseHP)
    noiseHP.connect(noiseGain)
    noiseGain.connect(out)

    osc1.start(now)
    osc2.start(now)
    noise.start(now)

    osc1.stop(now + 0.095)
    osc2.stop(now + 0.09)
    noise.stop(now + 0.022)
  }

  playUiDingSoundC() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const ctx = this.audioContext
    const now = ctx.currentTime

    const ding1 = ctx.createOscillator()
    ding1.type = 'sine'
    ding1.frequency.setValueAtTime(1320, now)
    ding1.frequency.exponentialRampToValueAtTime(980, now + 0.06)

    const ding2 = ctx.createOscillator()
    ding2.type = 'sine'
    ding2.frequency.setValueAtTime(1980, now)
    ding2.frequency.exponentialRampToValueAtTime(1480, now + 0.055)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.002)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)

    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.setValueAtTime(700, now)
    hp.Q.setValueAtTime(0.6, now)

    const noiseBuffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 0.012)), ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    }

    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer

    const noiseHP = ctx.createBiquadFilter()
    noiseHP.type = 'highpass'
    noiseHP.frequency.setValueAtTime(5200, now)
    noiseHP.Q.setValueAtTime(0.9, now)

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.0001, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.02, now + 0.001)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.018)

    const out = ctx.createGain()
    out.gain.setValueAtTime(1, now)
    out.connect(this.masterGain)

    ding1.connect(gain)
    ding2.connect(gain)
    gain.connect(hp)
    hp.connect(out)

    noise.connect(noiseHP)
    noiseHP.connect(noiseGain)
    noiseGain.connect(out)

    ding1.start(now)
    ding2.start(now)
    noise.start(now)

    ding1.stop(now + 0.13)
    ding2.stop(now + 0.12)
    noise.stop(now + 0.02)
  }

  playWaterdropLikeAsset() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const ctx = this.audioContext
    const now = ctx.currentTime

    const main = ctx.createOscillator()
    main.type = 'sine'
    main.frequency.setValueAtTime(1120, now)
    main.frequency.exponentialRampToValueAtTime(360, now + 0.12)

    const sparkle = ctx.createOscillator()
    sparkle.type = 'sine'
    sparkle.frequency.setValueAtTime(1840, now)
    sparkle.frequency.exponentialRampToValueAtTime(900, now + 0.06)

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.003)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16)

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.setValueAtTime(2600, now)
    lp.frequency.exponentialRampToValueAtTime(1400, now + 0.08)
    lp.Q.setValueAtTime(0.7, now)

    const noiseBuffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 0.02)), ctx.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    }

    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer

    const noiseHP = ctx.createBiquadFilter()
    noiseHP.type = 'highpass'
    noiseHP.frequency.setValueAtTime(3200, now)
    noiseHP.Q.setValueAtTime(0.8, now)

    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.0001, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.018, now + 0.001)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05)

    const out = ctx.createGain()
    out.gain.setValueAtTime(1, now)
    out.connect(this.masterGain)

    main.connect(gain)
    sparkle.connect(gain)
    gain.connect(lp)
    lp.connect(out)

    noise.connect(noiseHP)
    noiseHP.connect(noiseGain)
    noiseGain.connect(out)

    main.start(now)
    sparkle.start(now)
    noise.start(now)

    main.stop(now + 0.17)
    sparkle.stop(now + 0.1)
    noise.stop(now + 0.055)
  }

  playRainIntoWaterSound() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const ctx = this.audioContext
    const base = ctx.currentTime

    const out = ctx.createGain()
    out.gain.setValueAtTime(1, base)
    out.connect(this.masterGain)

    const droplets = 6
    for (let i = 0; i < droplets; i += 1) {
      const t = base + i * 0.06 + Math.random() * 0.025

      const tone = ctx.createOscillator()
      tone.type = 'sine'
      const startHz = 980 + Math.random() * 420
      const endHz = 220 + Math.random() * 160
      tone.frequency.setValueAtTime(startHz, t)
      tone.frequency.exponentialRampToValueAtTime(endHz, t + 0.09)

      const toneGain = ctx.createGain()
      toneGain.gain.setValueAtTime(0.0001, t)
      toneGain.gain.exponentialRampToValueAtTime(0.085, t + 0.004)
      toneGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11)

      const toneLP = ctx.createBiquadFilter()
      toneLP.type = 'lowpass'
      toneLP.frequency.setValueAtTime(2200, t)
      toneLP.frequency.exponentialRampToValueAtTime(900, t + 0.08)
      toneLP.Q.setValueAtTime(0.7, t)

      const noiseBuffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * 0.03)), ctx.sampleRate)
      const data = noiseBuffer.getChannelData(0)
      for (let n = 0; n < data.length; n += 1) {
        data[n] = (Math.random() * 2 - 1) * (1 - n / data.length)
      }

      const noise = ctx.createBufferSource()
      noise.buffer = noiseBuffer

      const splashBP = ctx.createBiquadFilter()
      splashBP.type = 'bandpass'
      splashBP.frequency.setValueAtTime(1400 + Math.random() * 700, t)
      splashBP.Q.setValueAtTime(10 + Math.random() * 4, t)

      const splashGain = ctx.createGain()
      splashGain.gain.setValueAtTime(0.0001, t)
      splashGain.gain.exponentialRampToValueAtTime(0.05, t + 0.002)
      splashGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04)

      tone.connect(toneGain)
      toneGain.connect(toneLP)
      toneLP.connect(out)

      noise.connect(splashBP)
      splashBP.connect(splashGain)
      splashGain.connect(out)

      tone.start(t)
      tone.stop(t + 0.13)
      noise.start(t)
      noise.stop(t + 0.045)
    }
  }

  playBubblePopSound() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const now = this.audioContext.currentTime

    const tone = this.audioContext.createOscillator()
    tone.type = 'sine'
    tone.frequency.setValueAtTime(340, now)
    tone.frequency.exponentialRampToValueAtTime(85, now + 0.12)

    const toneGain = this.audioContext.createGain()
    toneGain.gain.setValueAtTime(0.0001, now)
    toneGain.gain.exponentialRampToValueAtTime(0.24, now + 0.004)
    toneGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14)

    const toneLowpass = this.audioContext.createBiquadFilter()
    toneLowpass.type = 'lowpass'
    toneLowpass.frequency.setValueAtTime(1800, now)
    toneLowpass.Q.setValueAtTime(0.8, now)

    const noiseBuffer = this.audioContext.createBuffer(1, Math.max(1, Math.floor(this.audioContext.sampleRate * 0.02)), this.audioContext.sampleRate)
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    }

    const noise = this.audioContext.createBufferSource()
    noise.buffer = noiseBuffer

    const noiseFilter = this.audioContext.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.setValueAtTime(2200, now)
    noiseFilter.Q.setValueAtTime(10, now)

    const noiseGain = this.audioContext.createGain()
    noiseGain.gain.setValueAtTime(0.0001, now)
    noiseGain.gain.exponentialRampToValueAtTime(0.12, now + 0.002)
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03)

    const click = this.audioContext.createOscillator()
    click.type = 'square'
    click.frequency.setValueAtTime(1200, now)

    const clickGain = this.audioContext.createGain()
    clickGain.gain.setValueAtTime(0.0001, now)
    clickGain.gain.exponentialRampToValueAtTime(0.06, now + 0.001)
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.012)

    const out = this.audioContext.createGain()
    out.gain.setValueAtTime(1, now)
    out.connect(this.masterGain)

    tone.connect(toneGain)
    toneGain.connect(toneLowpass)
    toneLowpass.connect(out)

    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(out)

    click.connect(clickGain)
    clickGain.connect(out)

    tone.start(now)
    tone.stop(now + 0.16)
    noise.start(now)
    noise.stop(now + 0.04)
    click.start(now)
    click.stop(now + 0.015)
  }

  playRaindropSound() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const now = this.audioContext.currentTime

    const noiseBuffer = this.audioContext.createBuffer(
      1,
      Math.max(1, Math.floor(this.audioContext.sampleRate * 0.05)),
      this.audioContext.sampleRate,
    )
    const data = noiseBuffer.getChannelData(0)
    for (let i = 0; i < data.length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / data.length)
    }

    const noise = this.audioContext.createBufferSource()
    noise.buffer = noiseBuffer

    const bandpass = this.audioContext.createBiquadFilter()
    bandpass.type = 'bandpass'
    bandpass.frequency.setValueAtTime(900, now)
    bandpass.Q.setValueAtTime(8, now)

    const gain = this.audioContext.createGain()
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.exponentialRampToValueAtTime(0.16, now + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12)

    noise.connect(bandpass)
    bandpass.connect(gain)
    gain.connect(this.masterGain)

    noise.start(now)
    noise.stop(now + 0.13)
  }

  playSuccessSound() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const oscillator1 = this.audioContext.createOscillator()
    const oscillator2 = this.audioContext.createOscillator()
    const gainNode = this.audioContext.createGain()

    oscillator1.connect(gainNode)
    oscillator2.connect(gainNode)
    gainNode.connect(this.masterGain)

    oscillator1.frequency.setValueAtTime(523.25, this.audioContext.currentTime)
    oscillator2.frequency.setValueAtTime(659.25, this.audioContext.currentTime)

    oscillator1.frequency.setValueAtTime(659.25, this.audioContext.currentTime + 0.1)
    oscillator2.frequency.setValueAtTime(783.99, this.audioContext.currentTime + 0.1)

    oscillator1.frequency.setValueAtTime(783.99, this.audioContext.currentTime + 0.2)
    oscillator2.frequency.setValueAtTime(1046.5, this.audioContext.currentTime + 0.2)

    gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5)

    oscillator1.start(this.audioContext.currentTime)
    oscillator2.start(this.audioContext.currentTime)
    oscillator1.stop(this.audioContext.currentTime + 0.5)
    oscillator2.stop(this.audioContext.currentTime + 0.5)
  }

  playErrorSound() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const oscillator = this.audioContext.createOscillator()
    const gainNode = this.audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(this.masterGain)

    oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.3)

    gainNode.gain.setValueAtTime(0.3, this.audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3)

    oscillator.start(this.audioContext.currentTime)
    oscillator.stop(this.audioContext.currentTime + 0.3)
  }

  playWarningSound() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const oscillator = this.audioContext.createOscillator()
    const gainNode = this.audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(this.masterGain)

    oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime)
    oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.1)
    oscillator.frequency.setValueAtTime(600, this.audioContext.currentTime + 0.2)

    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime)
    gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime + 0.01)
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime + 0.05)
    gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime + 0.11)
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime + 0.15)
    gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime + 0.21)
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime + 0.25)

    oscillator.start(this.audioContext.currentTime)
    oscillator.stop(this.audioContext.currentTime + 0.3)
  }

  playInfoSound() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const oscillator = this.audioContext.createOscillator()
    const gainNode = this.audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(this.masterGain)

    oscillator.frequency.setValueAtTime(440, this.audioContext.currentTime)
    oscillator.frequency.setValueAtTime(554.37, this.audioContext.currentTime + 0.1)

    gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2)

    oscillator.start(this.audioContext.currentTime)
    oscillator.stop(this.audioContext.currentTime + 0.2)
  }

  playHoverSound() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const oscillator = this.audioContext.createOscillator()
    const gainNode = this.audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(this.masterGain)

    oscillator.frequency.setValueAtTime(1000, this.audioContext.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(1200, this.audioContext.currentTime + 0.05)

    gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.05)

    oscillator.start(this.audioContext.currentTime)
    oscillator.stop(this.audioContext.currentTime + 0.05)
  }

  playPageTransitionSound() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const oscillator = this.audioContext.createOscillator()
    const gainNode = this.audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(this.masterGain)

    oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(800, this.audioContext.currentTime + 0.3)

    gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3)

    oscillator.start(this.audioContext.currentTime)
    oscillator.stop(this.audioContext.currentTime + 0.3)
  }

  playMagicSound() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const oscillator1 = this.audioContext.createOscillator()
    const oscillator2 = this.audioContext.createOscillator()
    const gainNode = this.audioContext.createGain()

    oscillator1.connect(gainNode)
    oscillator2.connect(gainNode)
    gainNode.connect(this.masterGain)

    oscillator1.frequency.setValueAtTime(261.63, this.audioContext.currentTime)
    oscillator1.frequency.exponentialRampToValueAtTime(523.25, this.audioContext.currentTime + 0.5)

    oscillator2.frequency.setValueAtTime(329.63, this.audioContext.currentTime)
    oscillator2.frequency.exponentialRampToValueAtTime(659.25, this.audioContext.currentTime + 0.5)

    gainNode.gain.setValueAtTime(0.15, this.audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5)

    oscillator1.start(this.audioContext.currentTime)
    oscillator2.start(this.audioContext.currentTime)
    oscillator1.stop(this.audioContext.currentTime + 0.5)
    oscillator2.stop(this.audioContext.currentTime + 0.5)
  }

  playParticleSound() {
    if (!this.ensureReady() || !this.audioContext || !this.masterGain) return

    const oscillator = this.audioContext.createOscillator()
    const gainNode = this.audioContext.createGain()

    oscillator.connect(gainNode)
    gainNode.connect(this.masterGain)

    oscillator.frequency.setValueAtTime(800 + Math.random() * 400, this.audioContext.currentTime)
    oscillator.frequency.exponentialRampToValueAtTime(200, this.audioContext.currentTime + 0.1)

    gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime)
    gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1)

    oscillator.start(this.audioContext.currentTime)
    oscillator.stop(this.audioContext.currentTime + 0.1)
  }
}

export const audioManager = new AudioEffectManager()

export const playClickSound = () => audioManager.playClickSound()
export const playNiceClickSoundA = () => audioManager.playNiceClickSoundA()
export const playNiceClickSoundB = () => audioManager.playNiceClickSoundB()
export const playUiDingSoundC = () => audioManager.playUiDingSoundC()
export const playWaterdropLikeAsset = () => audioManager.playWaterdropLikeAsset()
export const playRainIntoWaterSound = () => audioManager.playRainIntoWaterSound()
export const playSingleRainDropIntoWaterSound = () => audioManager.playSingleRainDropIntoWaterSound()
export const playBubblePopSound = () => audioManager.playBubblePopSound()
export const playRaindropSound = () => audioManager.playRaindropSound()
export const playSuccessSound = () => audioManager.playSuccessSound()
export const playErrorSound = () => audioManager.playErrorSound()
export const playWarningSound = () => audioManager.playWarningSound()
export const playInfoSound = () => audioManager.playInfoSound()
export const playHoverSound = () => audioManager.playHoverSound()
export const playPageTransitionSound = () => audioManager.playPageTransitionSound()
export const playMagicSound = () => audioManager.playMagicSound()
export const playParticleSound = () => audioManager.playParticleSound()

export const setAudioEnabled = (enabled: boolean) => audioManager.setEnabled(enabled)
export const setAudioVolume = (volume: number) => audioManager.setVolume(volume)
