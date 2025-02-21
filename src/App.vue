<template>
  <div class="min-h-screen bg-black text-green-400 flex flex-col items-center justify-center p-4">
    <h1 class="text-3xl font-bold mb-4">Neon QR Scanner</h1>

    <!-- Camera Selection -->
    <div class="flex flex-col items-start mb-2">
      <label class="mb-1">Select Camera:</label>
      <select
        v-model="selectedCamera"
        class="text-black px-2 py-1"
      >
        <option value="" disabled>Select a camera</option>
        <option
          v-for="(cam, idx) in cameras"
          :key="cam.deviceId"
          :value="cam.deviceId"
        >
          {{ cam.label || "Camera " + (idx + 1) }}
        </option>
      </select>
    </div>

    <!-- Microphone Selection -->
    <div class="flex flex-col items-start mb-4">
      <label class="mb-1">Select Microphone:</label>
      <select
        v-model="selectedMicrophone"
        class="text-black px-2 py-1"
      >
        <option value="" disabled>Select a microphone</option>
        <option
          v-for="(mic, idx) in microphones"
          :key="mic.deviceId"
          :value="mic.deviceId"
        >
          {{ mic.label || "Microphone " + (idx + 1) }}
        </option>
      </select>
    </div>

    <!-- Video Preview -->
    <video
      ref="videoElem"
      class="border border-green-400 rounded mb-4"
      width="320"
      height="240"
      autoplay
      playsinline
    ></video>

    <!-- Display the decompressed SDP -->
    <pre class="border border-green-400 p-2 rounded w-3/4 bg-black/50 min-h-[100px]">
      {{ decompressedSDP }}
    </pre>

    <!-- Buttons -->
    <div class="flex flex-row gap-2">
      <!-- Start / Switch Camera/Mic -->
      <button
        class="px-4 py-2 border border-green-400 hover:bg-green-400 hover:text-black rounded"
        @click="startCamera"
      >
        Start Camera
      </button>

      <!-- Mute/Unmute Audio -->
      <button
        class="px-4 py-2 border border-green-400 hover:bg-green-400 hover:text-black rounded"
        @click="toggleMute"
        v-if="localStream"
      >
        {{ isMuted ? 'Unmute Audio' : 'Mute Audio' }}
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import jsQR from 'jsqr'
import { decompressZlibBase64UrlSafe } from '@mastashake08/zlib-urlsafe'

// ======= Reactive State =======
const videoElem = ref(null)
const cameraActive = ref(false)
const error = ref('')
const qrFound = ref(false)
const qrText = ref('')
const decompressedSDP = ref('')

// The single local media stream used for preview + WebRTC sending
const localStream = ref(null)

// For enumerating devices
const cameras = ref([])
const microphones = ref([])
const selectedCamera = ref('')
const selectedMicrophone = ref('')

// Track whether audio is muted
const isMuted = ref(false)

// Reference to the RTCPeerConnection
let pc = null

// ======= Lifecycle / Setup =======
onMounted(() => {
  loadDeviceList()
})

// Enumerate audio/video input devices
async function loadDeviceList() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    cameras.value = devices.filter(d => d.kind === 'videoinput')
    microphones.value = devices.filter(d => d.kind === 'audioinput')

    if (!selectedCamera.value && cameras.value.length) {
      selectedCamera.value = cameras.value[0].deviceId
    }
    if (!selectedMicrophone.value && microphones.value.length) {
      selectedMicrophone.value = microphones.value[0].deviceId
    }
  } catch (err) {
    error.value = `Error enumerating devices: ${err.message}`
    console.error(err)
  }
}

// ======= Camera / Mic Control =======
async function startCamera() {
  if (!selectedCamera.value && !selectedMicrophone.value) {
    error.value = 'Please select a camera and a microphone first.'
    return
  }

  try {
    const constraints = {
      video: selectedCamera.value
        ? { deviceId: { exact: selectedCamera.value } }
        : true,
      audio: selectedMicrophone.value
        ? { deviceId: { exact: selectedMicrophone.value } }
        : true,
    }

    // Get (or switch) local media
    localStream.value = await navigator.mediaDevices.getUserMedia(constraints)
    videoElem.value.srcObject = localStream.value
    cameraActive.value = true
    isMuted.value = false // reset audio to unmuted if we changed streams

    // Start scanning for QR codes
    requestAnimationFrame(scanFrame)
  } catch (err) {
    error.value = `Camera error: ${err.message}`
    console.error(err)
  }
}

// Toggle the audio track(s) from the local stream
function toggleMute() {
  if (!localStream.value) return

  isMuted.value = !isMuted.value

  // For each audio track in the local stream, enable or disable it
  localStream.value.getAudioTracks().forEach(track => {
    track.enabled = !isMuted.value
  })
}

// ======= QR Scanning =======
function scanFrame() {
  if (!cameraActive.value) return

  const video = videoElem.value
  if (!video || video.readyState !== video.HAVE_ENOUGH_DATA) {
    requestAnimationFrame(scanFrame)
    return
  }

  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  const ctx = canvas.getContext('2d')
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const code = jsQR(imageData.data, canvas.width, canvas.height)

  if (code && code.data) {
    qrFound.value = true
    qrText.value = code.data
    handleOfferSDP(code.data)
  } else {
    requestAnimationFrame(scanFrame)
  }
}

// ======= WebRTC: Decompress + Send-Only Answer =======
async function handleOfferSDP(scannedString) {
  try {
    // 1. Decompress the scanned zlib+Base64 string
    const sdp = await decompressZlibBase64UrlSafe(scannedString)
    decompressedSDP.value = sdp
    console.log('[App] Decompressed offer SDP:', sdp)

    // 2. Create an RTCPeerConnection
    pc = new RTCPeerConnection()

    // 3. Add existing local stream tracks to the PeerConnection
    if (!localStream.value) {
      error.value = 'No local stream. Please start camera/mic first.'
      return
    }
    localStream.value.getTracks().forEach(track => {
      pc.addTrack(track, localStream.value)
    })

    // 4. Set the scanned string as the remote offer
    await pc.setRemoteDescription({ type: 'offer', sdp })

    // 5. Create and set the local answer (send-only from this side)
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    console.log('[App] Local answer SDP:', pc.localDescription.sdp)

    // In a real app, also exchange ICE candidates with the remote side
  } catch (err) {
    error.value = `Decompression/WebRTC error: ${err.message}`
    console.error(err)
  }
}
</script>

<style scoped>
/* Additional styling if desired */
</style>
