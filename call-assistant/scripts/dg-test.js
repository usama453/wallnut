const WebSocket = require('ws')
const fs = require('fs')
const key = process.env.GK
const model = process.argv[2] || 'gemini-3.1-flash-live-preview'
const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`

const ws = new WebSocket(url)

ws.on('open', () => {
  console.log('OPEN', model)
  const setup = {
    setup: {
      model: `models/${model}`,
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Puck' } } }
      },
      inputAudioTranscription: {},
      systemInstruction: { parts: [{ text: 'Transcribe the user\'s speech verbatim. Do not respond, only transcribe.' }] }
    }
  }
  ws.send(JSON.stringify(setup))
})

ws.on('message', (raw) => {
  const msg = JSON.parse(raw.toString())
  if (msg.setupComplete) {
    console.log('SETUP COMPLETE')
    const b64 = fs.readFileSync('/tmp/speech_b64.txt', 'utf8')
    const chunk = 16000
    let idx = 0
    const sendNext = () => {
      if (idx >= b64.length) { console.log('DONE SENDING'); return }
      ws.send(JSON.stringify({ realtimeInput: { audio: { mimeType: 'audio/pcm;rate=16000', data: b64.slice(idx, idx + chunk) } } }))
      idx += chunk
      setTimeout(sendNext, 500)
    }
    sendNext()
  } else if (msg.serverContent) {
    const sc = msg.serverContent
    if (sc.modelTurn) {
      console.log('MODEL TURN turnComplete=', sc.turnComplete, 'parts=', (sc.modelTurn.parts||[]).map(p=>p.text||'[audio]').join('|'))
    }
    if (sc.inputTranscription) {
      console.log('INPUT TRANSCRIPT:', JSON.stringify(sc.inputTranscription))
    }
    if (sc.turnComplete !== undefined && !sc.modelTurn) console.log('turnComplete flag=', sc.turnComplete)
  } else {
    const keys = Object.keys(msg)
    console.log('MSG:', keys.join(','), JSON.stringify(msg).slice(0, 200))
  }
})

ws.on('close', (code, reason) => {
  console.log('CLOSED', code, reason.toString().slice(0, 200))
  process.exit()
})
ws.on('error', (e) => console.log('ERR', e.message))
setTimeout(() => { console.log('TIMEOUT'); process.exit() }, 45000)