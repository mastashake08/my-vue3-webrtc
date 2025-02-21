<template>
  <div class="min-h-screen w-full bg-gradient-to-br from-gray-900 to-black text-lime-300 flex flex-col items-center p-6">
    <h1 class="text-4xl font-extrabold neon-text mb-6 uppercase tracking-wide">
      WebRTC QR Signaling Vue 3
    </h1>

    <!-- Toggleable Info -->
    <button
      class="mb-6 px-5 py-2 border border-lime-400 text-lime-300 hover:bg-lime-400 hover:text-black rounded-full transition-colors duration-300 shadow-neon"
      @click="showInfo = !showInfo"
    >
      {{ showInfo ? 'Hide' : 'Show' }} Info
    </button>

    <!-- How-To Section -->
    <div
      v-if="showInfo"
      class="max-w-xl text-center mb-8 bg-black/50 p-4 rounded-lg shadow-md neon-border"
    >
      <p class="mb-2">
        1) Choose your camera and microphone, or click <b>Share Screen</b> to capture your desktop.
      </p>
      <p class="mb-2">
        2) Click <b>Start Camera</b> (if using camera) or <b>Share Screen</b> to see a live preview.
      </p>
      <p class="mb-2">
        3) Show a QR code with a zlib-compressed, Base64-encoded <em>SDP offer</em>.
      </p>
      <p class="mb-2">
        4) This side sets up a <strong>send-only</strong> WebRTC call (audio/video or screen).
      </p>
      <p class="mb-2">
        5) Use <b>Mute Audio</b> to disable your mic, or <b>Stop</b> to end the local stream.
      </p>
    </div>

    <!-- Device Selection Container: Centered -->
    <div class="flex flex-col items-center justify-center gap-4 w-full max-w-xl mb-6">
      <!-- Camera Selection -->
      <div class="w-full flex flex-col items-center">
        <label class="mb-1 font-semibold text-sm uppercase tracking-wider text-center">
          Select Camera:
        </label>
        <select
          v-model="selectedCamera"
          class="text-black px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-400"
        >
          <option value="" disabled>Select a camera</option>
          <option
            v-for="(cam, idx) in cameras"
            :key="cam.deviceId"
            :value="cam.deviceId"
          >
            {{ cam.label || 'Camera ' + (idx + 1) }}
          </option>
        </select>
      </div>

      <!-- Microphone Selection -->
      <div class="w-full flex flex-col items-center">
        <label class="mb-1 font-semibold text-sm uppercase tracking-wider text-center">
          Select Microphone:
        </label>
        <select
          v-model="selectedMicrophone"
          class="text-black px-3 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-lime-400"
        >
          <option value="" disabled>Select a microphone</option>
          <option
            v-for="(mic, idx) in microphones"
            :key="mic.deviceId"
            :value="mic.deviceId"
          >
            {{ mic.label || 'Microphone ' + (idx + 1) }}
          </option>
        </select>
      </div>
    </div>

    <!-- Video (or Screen) Preview -->
    <video
      ref="videoElem"
      class="border border-lime-400 rounded-lg mb-4 glow-border"
      width="320"
      height="240"
      autoplay
      playsinline
    ></video>

    <!-- Decompressed SDP -->
    <pre class="border border-lime-400 p-3 rounded-lg w-3/4 bg-black/50 min-h-[100px] mb-6 text-sm overflow-x-auto glow-border">
{{ decompressedSDP }}
    </pre>

    <!-- Action Buttons -->
    <div class="flex flex-row flex-wrap gap-4">
      <!-- Start Camera/Mic -->
      <button
        class="px-5 py-2 border border-lime-400 text-lime-300 hover:bg-lime-400 hover:text-black rounded-full transition-colors duration-300 shadow-neon"
        @click="startCamera"
      >
        Start Camera
      </button>

      <!-- Share Screen (only if getDisplayMedia is available) -->
      <button
        v-if="isScreenShareSupported"
        class="px-5 py-2 border border-lime-400 text-lime-300 hover:bg-lime-400 hover:text-black rounded-full transition-colors duration-300 shadow-neon"
        @click="startScreenShare"
      >
        Share Screen
      </button>

      <!-- Mute/Unmute Audio -->
      <button
        v-if="localStream"
        class="px-5 py-2 border border-lime-400 text-lime-300 hover:bg-lime-400 hover:text-black rounded-full transition-colors duration-300 shadow-neon"
        @click="toggleMute"
      >
        {{ isMuted ? 'Unmute Audio' : 'Mute Audio' }}
      </button>

      <!-- Stop Camera/Screen -->
      <button
        v-if="localStream"
        class="px-5 py-2 border border-lime-400 text-lime-300 hover:bg-lime-400 hover:text-black rounded-full transition-colors duration-300 shadow-neon"
        @click="stopCamera"
      >
        Stop
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import jsQR from 'jsqr'
import { decompressZlibBase64UrlSafe } from '@mastashake08/zlib-urlsafe'

/** Reactive States */
const showInfo = ref(false)
const videoElem = ref(null)
const cameraActive = ref(false)
const error = ref('')
const qrFound = ref(false)
const qrText = ref('')
const decompressedSDP = ref('')

// Single local media stream for preview + WebRTC
const localStream = ref(null)
let pc = null

// Device lists & user selections
const cameras = ref([])
const microphones = ref([])
const selectedCamera = ref('')
const selectedMicrophone = ref('')

// Mute state
const isMuted = ref(false)

/** Check if screen sharing is supported */
const isScreenShareSupported = computed(() => {
  return !!navigator.mediaDevices?.getDisplayMedia
})

/** onMounted: enumerate devices */
onMounted(() => {
  loadDeviceList()
})

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

/** Start Camera & Microphone with chosen devices */
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

    // Stop any old stream first
    if (localStream.value) {
      localStream.value.getTracks().forEach(t => t.stop())
    }

    localStream.value = await navigator.mediaDevices.getUserMedia(constraints)
    videoElem.value.srcObject = localStream.value
    cameraActive.value = true
    isMuted.value = false  // default to unmuted
    listenForTrackEnd(localStream.value)
    requestAnimationFrame(scanFrame)
  } catch (err) {
    error.value = `Camera error: ${err.message}`
    console.error(err)
  }
}

/** Start Screen Share (video only) */
async function startScreenShare() {
  if (!navigator.mediaDevices?.getDisplayMedia) {
    error.value = 'Screen sharing not supported in this browser.'
    return
  }

  try {
    // Stop any old stream (camera or previous screen)
    if (localStream.value) {
      localStream.value.getTracks().forEach(t => t.stop())
    }

    // Get screen capture (video only by default)
    const screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true
      // audio: true  <-- partially supported in some browsers if you want system audio
    })

    localStream.value = screenStream
    videoElem.value.srcObject = localStream.value
    cameraActive.value = true
    isMuted.value = false  // no built-in mic here, but let's keep consistent

    listenForTrackEnd(localStream.value)
    requestAnimationFrame(scanFrame)
  } catch (err) {
    error.value = `Screen share error: ${err.message}`
    console.error(err)
  }
}

/** If a user stops screen share or camera track externally, handle track.onended */
function listenForTrackEnd(stream) {
  stream.getTracks().forEach(track => {
    track.onended = () => {
      console.log('Track ended:', track)
      // e.g., user clicked "Stop sharing" in the browser prompt
      // You could automatically do 'stopCamera()' or revert to camera
      // For now, we just do:
      stopCamera()
    }
  })
}

/** Mute/Unmute local audio tracks (if any) */
function toggleMute() {
  if (!localStream.value) return
  isMuted.value = !isMuted.value
  localStream.value.getAudioTracks().forEach(track => {
    track.enabled = !isMuted.value
  })
}

/** Stop Camera (or screen) */
function stopCamera() {
  if (!localStream.value) return
  localStream.value.getTracks().forEach(t => t.stop())
  localStream.value = null
  cameraActive.value = false
}

/** Continuously scan video feed for QR codes */
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

/** Decompress QR code's SDP & create send-only WebRTC answer */
async function handleOfferSDP(scannedString) {
  try {
    // 1. Decompress the scanned string
    const sdp = await decompressZlibBase64UrlSafe(scannedString)
    decompressedSDP.value = sdp
    console.log('[App] Decompressed offer SDP:', sdp)

    // 2. Create PeerConnection
    pc = new RTCPeerConnection()

    // 3. Add local tracks if camera/screen is active
    if (!localStream.value) {
      error.value = 'No local stream. Please start camera or screen share first.'
      return
    }
    localStream.value.getTracks().forEach(track => {
      pc.addTrack(track, localStream.value)
    })

    // 4. Set remote description (offer)
    await pc.setRemoteDescription({ type: 'offer', sdp })

    // 5. Create and set local answer
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    console.log('[App] Local answer SDP:', pc.localDescription.sdp)

    // In a real app, also exchange ICE candidates
  } catch (err) {
    error.value = `Decompression/WebRTC error: ${err.message}`
    console.error(err)
  }
}
</script>

<style scoped>
/* 
  A neon-like text glow:
*/
.neon-text {
  text-shadow:
    0 0 5px #0f0,
    0 0 10px #0f0,
    0 0 20px #0f0,
    0 0 40px #0f0;
}

/* Optional soft glow around borders */
.glow-border {
  box-shadow: inset 0 0 5px #0f0;
}

/* Extra intense neon shadow on buttons, etc. */
.shadow-neon {
  box-shadow:
    0 0 5px rgba(0, 255, 0, 0.5),
    0 0 15px rgba(0, 255, 0, 0.3);
}

/* A neon ring around container (or set for .neon-border) */
.neon-border {
  border: 1px solid #0f0;
  box-shadow:
    0 0 5px #0f0,
    0 0 10px #0f0,
    0 0 20px #0f0;
}
</style>
