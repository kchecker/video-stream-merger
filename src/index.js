/* globals window, AudioContext */

module.exports = VideoStreamMerger

window.AudioContext = window.AudioContext || window.webkitAudioContext

function VideoStreamMerger (opts) {
  var self = this
  if (!(self instanceof VideoStreamMerger)) return new VideoStreamMerger(opts)

  opts = opts || {}
  self.width = opts.width || 400
  self.height = opts.height || 300
  self.fps = opts.fps || 25

  // Hidden canvas element for merging
  self._canvas = document.createElement('canvas')
  self._canvas.setAttribute('width', self.width)
  self._canvas.setAttribute('height', self.height)
  self._canvas.setAttribute('style', 'position:fixed; right: -10px') // Push off screen
  document.body.appendChild(self._canvas)
  self._ctx = self._canvas.getContext('2d')

  // Hidden div to contain video elements
  self._container = document.createElement('div')
  self._container.setAttribute('style', 'display:none')
  document.body.appendChild(self._container)

  self._videos = []

  self._audioCtx = new AudioContext()
  self._audioDestination = self._audioCtx.createMediaStreamDestination()

  self.started = false
  self.result = null
}

VideoStreamMerger.prototype.addStream = function (mediaStream, opts) {
  var self = this

  opts = opts || {}

  opts.x = opts.x || 0
  opts.y = opts.y || 0
  opts.width = opts.width || self.width
  opts.height = opts.height || self.height
  opts.draw = opts.draw || null
  opts.mute = opts.mute || false

  // If it is the same MediaStream, we can reuse our video element (and ignore sound)
  var video = null
  for (var i = 0; i < self._videos.length; i++) {
    if (self._videos[i].id === mediaStream.id) {
      video = self._videos[i].element
    }
  }

  if (!video) {
    video = document.createElement('video')
    video.autoplay = true
    video.muted = true
    self._container.appendChild(video)
    video.src = window.URL.createObjectURL(mediaStream)

    if (!opts.mute) {
      var audioSource = self._audioCtx.createMediaStreamSource(mediaStream)
      audioSource.connect(self._audioDestination)
    }
  }

  opts.element = video
  opts.id = mediaStream.id || null
  self._videos.push(opts)
}

VideoStreamMerger.prototype.removeStream = function (mediaStream) {
  var self = this

  var found = false

  for (var i = 0; i < self._videos.length; i++) {
    if (mediaStream.id === self._videos[i].id) {
      self._container.removeChild(self._videos[i].element)
      self._videos[i] = null
      self._videos.splice(i, 1)
      found = true // keep going, duplicates
    }
  }

  if (!found) throw new Error('Provided stream was never added')
}

VideoStreamMerger.prototype.start = function () {
  var self = this

  self.started = true
  window.requestAnimationFrame(self._draw.bind(self))

  // Add video
  self.result = self._canvas.captureStream(self.fps)

  // Remove "dead" audio track
  var deadTrack = self.result.getAudioTracks()[0]
  if (deadTrack) self.result.removeTrack(deadTrack)

  // Add audio
  var audioTracks = self._audioDestination.stream.getAudioTracks()
  self.result.addTrack(audioTracks[0])
}

VideoStreamMerger.prototype._draw = function () {
  var self = this
  if (!self.started) return

  var awaiting = self._videos.length
  function done () {
    awaiting--
    if (!awaiting) window.requestAnimationFrame(self._draw.bind(self))
  }

  self._videos.forEach(function (video) {
    if (video.draw) { // custom frame transform
      video.draw(self._ctx, video.element, done)
    } else {
      self._ctx.drawImage(video.element, video.x, video.y, video.width, video.height)
      done()
    }
  })
}

VideoStreamMerger.prototype.destroy = function () {
  var self = this

  self.started = false

  document.body.removeChild(self._canvas)
  document.body.removeChild(self._container)

  self._canvas = null
  self._ctx = null
  self._container = null
  self._videos = []
  self._audioCtx = null
  self._audioDestination = null

  self.result.getTracks().forEach(function (t) {
    t.stop()
  })
  self.result = null
}

module.exports = VideoStreamMerger
